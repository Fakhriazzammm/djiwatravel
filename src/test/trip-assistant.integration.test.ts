/**
 * Runs the trip assistant end to end against a real Postgres with a stubbed AI gateway: send,
 * proposal, apply, double-apply, undo, quota, guest rule, failure and ownership. Skipped unless
 * TEST_DATABASE_URL points at a throwaway database (it drops and recreates the public schema):
 *   TEST_DATABASE_URL=postgresql://tester@127.0.0.1:55432/t npx vitest run src/test/trip-assistant.integration.test.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The place lookups keep Nominatim's one request a second even with a stubbed network.
vi.setConfig({ testTimeout: 30_000 });

const url = process.env["TEST_DATABASE_URL"];
const holder = vi.hoisted(() => ({
  pool: null as unknown,
  owner: { id: "u1", email: "a@b.c", guest: false } as {
    id: string;
    email: string | null;
    guest: boolean;
  } | null,
}));
vi.mock("@/db/client.server", () => ({
  get pool() {
    return holder.pool;
  },
}));
vi.mock("@/lib/guest-trips.server", () => ({
  resolveTripOwner: async () => holder.owner,
  requireTripOwner: async () => {
    if (!holder.owner) throw new Error("Autentikasi diperlukan");
    return holder.owner;
  },
  resolveTripOwnerForCreate: async () => holder.owner,
  getGuestTripStatusHandler: async () => ({}),
}));
vi.mock("@/lib/push.server", () => ({
  // Same contract as the real one (idempotent on the event key), minus the web push itself.
  createCustomerNotification: async (input: {
    subject: string;
    type: string;
    title: string;
    body: string;
    href: string;
    eventKey: string;
    source: string;
  }) => {
    const p = holder.pool as {
      query: (sql: string, args?: unknown[]) => Promise<{ rows: { id: string }[] }>;
    };
    const event = await p.query(
      "insert into notification_events (event_key, event_type) values ($1,$2) on conflict (event_key) do nothing returning id",
      [input.eventKey, input.type],
    );
    if (!event.rows[0]) return { created: false, notificationId: null, sent: 0 };
    await p.query(
      "insert into customer_notifications (event_id, recipient_customer_auth_subject, type, title, body, action_href) values ($1,$2,$3,$4,$5,$6)",
      [event.rows[0].id, input.subject, input.type, input.title, input.body, input.href],
    );
    return { created: true, notificationId: event.rows[0].id, sent: 0 };
  },
}));
vi.mock("@/lib/google-calendar.server", () => ({
  syncItineraryItem: async () => undefined,
  renameGoogleFiles: async () => undefined,
}));

import {
  resetReminderThrottle,
  sweepAssistantReminders,
} from "@/lib/trip-assistant-reminders.server";
import { hoursNote, nominatimVenue } from "@/lib/trip-assistant-places.server";
import {
  createTripShareLink,
  loadSharedTrip,
  readTripShareLink,
  revokeTripShareLink,
} from "@/lib/my-trips.server";
import {
  assistantApplyHandler,
  assistantDismissHandler,
  assistantRecordSummaryHandler,
  assistantLoadHandler,
  assistantPinHandler,
  assistantResetHandler,
  assistantSendHandler,
  assistantStreamHandler,
  assistantUndoHandler,
  travoDeleteHandler,
  travoListHandler,
  travoLoadHandler,
  clearAssistantBurst,
  purgeAssistantHistory,
} from "@/lib/trip-assistant.server";

type Item = { note: string | null; hours: unknown; lat: number | null; lng: number | null };
const TRIP = "11111111-1111-4111-8111-111111111111";
const I1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
let pool: pg.Pool;
let nextAnswer: unknown = null;
let failAi = false;
const nominatimCalls: string[] = [];
const nominatimRows: Record<string, unknown> = {};

const answer = (over: Record<string, unknown>) => ({
  reply: "Ini usulan saya.",
  chips: [],
  multi: false,
  kind: "none",
  title: "",
  agenda: [],
  budget: { total: 0, categories: [] },
  checklist: [],
  expense: { description: "", amount: 0, currency: "", date: "", category: "" },
  ...over,
});
const add = (title: string, start: string) => ({
  op: "add",
  id: "",
  title,
  place: "",
  date: "2026-11-09",
  start,
  end: "",
  location: "Tokyo",
  category: "food",
  cost: 100000,
  note: "",
});

async function reset() {
  await pool.query("drop schema public cascade; create schema public;");
  await pool.query(
    "do $$ begin create role djiwatravel_app; exception when duplicate_object then null; end $$;",
  );
  for (const file of [
    "004_admin_operations",
    "008_customer_profiles",
    "021_customer_traveler_profile",
    "018_my_trips",
    "022_travel_trip_shares",
    "019_google_calendar_sync",
    "020_allow_overnight_itinerary",
    "027_restore_admin_settings",
    "037_itinerary_map_points",
    "038_itinerary_place_image",
    "039_receipt_scans",
    "040_google_drive_sheets",
    "043_expense_items",
    "044_sheet_two_way",
    "045_place_ideas",
    "048_trip_cities",
    "058_trip_assistant",
    "059_assistant_blocks",
    "060_travo_conversations",
    "061_travo_cards",
    "062_travo_run_cards",
    "063_trip_origin",
    "064_trip_plan",
  ])
    await pool.query(readFileSync(resolve(`migrations/${file}.sql`), "utf8"));
  await pool.query(`create table notification_events (id uuid primary key default gen_random_uuid(), event_key text not null unique, event_type text not null);
    create table customer_notifications (id uuid primary key default gen_random_uuid(), event_id uuid not null, recipient_customer_auth_subject text not null, type text not null, title text not null, body text not null, action_href text, created_at timestamptz not null default now())`);
}

async function seed() {
  await pool.query("delete from travel_trips");
  await pool.query("delete from admin_settings");
  await pool.query(
    `insert into travel_trips (id,customer_auth_subject,name,destination_code,destination_name,departure_date,return_date,primary_currency,total_budget_minor,travelers_count)
     values ($1,'u1','Jepang','JP','Japan','2026-11-07','2026-11-12','IDR',1000000000,2)`,
    [TRIP],
  );
  await pool.query(
    `insert into travel_itinerary_items (id,trip_id,activity_date,start_time,title,location) values ($1,$2,'2026-11-08','22:00','Meiji Gallery','Tokyo')`,
    [I1, TRIP],
  );
  await pool.query(
    `insert into travel_budget_categories (trip_id,name,category_key,allocated_minor,currency,sort_order)
     values ($1,'Makan & minum','makan-&-minum',0,'IDR',0)`,
    [TRIP],
  );
}

const send = (
  text: string,
  intent?: "plan" | "budget" | "tidy" | "checklist" | "expense" | "chat",
) => assistantSendHandler({ data: { tripId: TRIP, text, ...(intent ? { intent } : {}) } });
const proposalOf = (result: Awaited<ReturnType<typeof send>>) => {
  if (result.status !== "ok") throw new Error(`send failed: ${result.status}`);
  return result.messages.at(-1)!.proposal!;
};
const count = async (sql: string) => Number((await pool.query(sql)).rows[0].n);

describe.skipIf(!url)("trip assistant (real Postgres, stubbed AI)", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    holder.pool = pool;
    process.env["HELIPOD_AI_KEY"] = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const target = String(input);
        if (target.includes("frankfurter"))
          return new Response(JSON.stringify({ date: "2026-11-09", rates: { IDR: 105 } }), {
            status: 200,
          });
        if (target.includes("nominatim")) {
          nominatimCalls.push(target);
          const q = new URL(target).searchParams.get("q") ?? "";
          const row = nominatimRows[q];
          return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
        }
        if (failAi) return new Response("boom", { status: 500 });
        const content = JSON.stringify(nextAnswer);
        const usage = { prompt_tokens: 2000, completion_tokens: 800 };
        const wantsStream = String(init?.body ?? "").includes('"stream":true');
        if (wantsStream) {
          const encoder = new TextEncoder();
          const pieces = content.match(/.{1,12}/gs) ?? [];
          const body = new ReadableStream({
            start(controller) {
              for (const piece of pieces)
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
                  ),
                );
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ choices: [], usage })}\n\n`),
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          });
          return new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), {
          status: 200,
        });
      }),
    );
    await reset();
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await pool?.end();
  });
  beforeEach(async () => {
    holder.owner = { id: "u1", email: "a@b.c", guest: false };
    failAi = false;
    nominatimCalls.length = 0;
    for (const k of Object.keys(nominatimRows)) delete nominatimRows[k];
    await pool.query("delete from customer_notifications");
    await pool.query("delete from notification_events");
    clearAssistantBurst();
    await seed();
    await pool.query("delete from travel_assistant_messages");
    await pool.query("delete from travel_assistant_conversations");
    await pool.query("delete from travel_assistant_proposals");
    await pool.query("delete from travel_assistant_runs");
  });

  it("stores Travo's visual blocks with the message and gives them back", async () => {
    nextAnswer = answer({
      reply: "Ini rencananya.",
      blocks: [
        { kind: "steps", title: "Rencana", items: ["09:00 Sarapan", "11:00 Museum"] },
        { kind: "bogus", title: "x", items: ["a"] },
        { kind: "tip", title: "Tips", items: ["Datang pagi"] },
      ],
    });
    const result = await send("ceritakan rencananya");
    expect(result.status).toBe("ok");
    const history = await assistantLoadHandler({ data: { tripId: TRIP } });
    expect(history.messages.at(-1)!.blocks).toEqual([
      { kind: "steps", title: "Rencana", items: ["09:00 Sarapan", "11:00 Museum"] },
      { kind: "tip", title: "Tips", items: ["Datang pagi"] },
    ]);
    expect(history.messages[0]!.blocks).toEqual([]); // the traveler's own message has none
  });

  it("shares one history between the trip chat and the Travo page", async () => {
    nextAnswer = answer({ reply: "Halo dari trip." });
    expect((await send("halo")).status).toBe("ok");
    // The trip chat shows up in the Travo history, with the same messages.
    const list = await travoListHandler();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ tripId: TRIP, scope: "trip", title: "Jepang" });
    const opened = await travoLoadHandler({ data: { conversationId: list[0]!.id } });
    expect(opened.messages.map((m) => m.content)).toEqual(["halo", "Halo dari trip."]);
    // Continuing from the Travo page lands in the same conversation, on the same trip.
    const again = await assistantSendHandler({
      data: { conversationId: list[0]!.id, text: "lanjut" },
    });
    expect(again.status).toBe("ok");
    expect(await count("select count(*)::int as n from travel_assistant_conversations")).toBe(1);
    const trip = await assistantLoadHandler({ data: { tripId: TRIP } });
    expect(trip.messages).toHaveLength(4);
    // Opening the trip from the Travo page reaches the same chat.
    const byTrip = await travoLoadHandler({ data: { tripId: TRIP } });
    expect(byTrip.messages).toHaveLength(4);
  });

  it("keeps a general Travo chat apart from trips and never proposes changes", async () => {
    nextAnswer = answer({
      reply: "Untuk 5 hari, 1 GB per hari cukup.",
      kind: "agenda",
      agenda: [add("Tidak boleh", "09:00")],
    });
    const sent = await assistantSendHandler({ data: { text: "eSIM Korea?", scope: "esim" } });
    if (sent.status !== "ok") throw new Error(sent.status);
    expect(sent.conversationId).toBeTruthy();
    expect(sent.messages.at(-1)!.proposal).toBeNull();
    expect(await count("select count(*)::int as n from travel_assistant_proposals")).toBe(0);
    expect(
      await count(
        "select count(*)::int as n from travel_itinerary_items where title='Tidak boleh'",
      ),
    ).toBe(0);
    const list = await travoListHandler();
    expect(list[0]).toMatchObject({ tripId: null, scope: "esim", title: "eSIM Korea?" });
    const run = await pool.query("select scope, trip_id from travel_assistant_runs");
    expect(run.rows[0]).toMatchObject({ scope: "esim", trip_id: null });
  });

  it("hides conversations from other travelers and deletes both views of a trip chat", async () => {
    nextAnswer = answer({ reply: "Halo." });
    await send("halo");
    const [mine] = await travoListHandler();
    holder.owner = { id: "u2", email: null, guest: false };
    expect(await travoListHandler()).toEqual([]);
    expect(
      (await travoLoadHandler({ data: { conversationId: mine!.id } })).conversation,
    ).toBeNull();
    await expect(
      assistantSendHandler({ data: { conversationId: mine!.id, text: "intip" } }),
    ).rejects.toThrow(/tidak ditemukan/);
    holder.owner = { id: "u1", email: "a@b.c", guest: false };
    await travoDeleteHandler({ data: { conversationId: mine!.id } });
    expect(await travoListHandler()).toEqual([]);
    expect((await assistantLoadHandler({ data: { tripId: TRIP } })).messages).toEqual([]);
  });

  it("keeps the 'Ringkas semua' exchange after a reload, and never sends it to the model", async () => {
    await assistantRecordSummaryHandler({ data: { tripId: TRIP } });
    const history = await assistantLoadHandler({ data: { tripId: TRIP } });
    expect(history.messages.map((m) => [m.role, m.local])).toEqual([
      ["user", "summary"],
      ["assistant", "summary"],
    ]);
    expect(history.messages[1]!.blocks).toEqual([]);
  });

  it("is available for the owner and loads an empty conversation", async () => {
    const loaded = await assistantLoadHandler({ data: { tripId: TRIP } });
    expect(loaded.status).toMatchObject({ available: true, guest: false, remaining: 30 });
    expect(loaded.messages).toEqual([]);
  });

  it("proposes an itinerary, applies it once, and undoes it", async () => {
    nextAnswer = answer({
      kind: "agenda",
      title: "Hari ke-3",
      agenda: [add("Sarapan Tsukiji", "08:30"), add("teamLab", "10:30")],
      chips: ["Tambah Checklist"],
    });
    const result = await send("buatkan itinerary hari ke-3", "plan");
    expect(result).toMatchObject({ status: "ok", remaining: 29 });
    const proposal = proposalOf(result);
    expect(proposal).toMatchObject({ kind: "agenda", status: "proposed" });
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(1); // nothing written yet

    await assistantApplyHandler({ data: { proposalId: proposal.id } });
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(3);
    await expect(assistantApplyHandler({ data: { proposalId: proposal.id } })).rejects.toThrow(
      /sudah diproses/,
    );
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(3);

    await assistantUndoHandler({ data: { proposalId: proposal.id } });
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(1);
    const history = await assistantLoadHandler({ data: { tripId: TRIP } });
    expect(history.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history.messages[1]!.proposal?.status).toBe("undone");
    expect(history.messages[1]!.chips?.options).toEqual(["Tambah Checklist"]);
    const run = (await pool.query("select * from travel_assistant_runs")).rows[0];
    expect(run).toMatchObject({
      intent: "plan",
      status: "ok",
      model: "glm-5.3-flashx",
      proposal_kind: "agenda",
      guest: false,
    });
    expect(Number(run.cost_idr)).toBeGreaterThan(0);
  });

  it("moves an existing activity and restores it on undo", async () => {
    nextAnswer = answer({
      kind: "agenda",
      title: "Rapikan",
      agenda: [{ ...add("", "13:00"), op: "update", id: I1, date: "2026-11-08", title: "" }],
    });
    const proposal = proposalOf(await send("rapikan agenda", "tidy"));
    expect(proposal.previous[I1]).toMatchObject({ title: "Meiji Gallery", startTime: "22:00" });
    await assistantApplyHandler({ data: { proposalId: proposal.id } });
    expect(
      (await pool.query("select start_time, title from travel_itinerary_items where id=$1", [I1]))
        .rows[0],
    ).toMatchObject({ start_time: "13:00:00", title: "Meiji Gallery" });
    await assistantUndoHandler({ data: { proposalId: proposal.id } });
    expect(
      (await pool.query("select start_time from travel_itinerary_items where id=$1", [I1])).rows[0]
        .start_time,
    ).toBe("22:00:00");
  });

  it("removes an activity and brings it back on undo", async () => {
    nextAnswer = answer({
      kind: "agenda",
      title: "Hapus",
      agenda: [{ ...add("", ""), op: "remove", id: I1, date: "" }],
    });
    const proposal = proposalOf(await send("hapus galeri", "tidy"));
    await assistantApplyHandler({ data: { proposalId: proposal.id } });
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(0);
    await assistantUndoHandler({ data: { proposalId: proposal.id } });
    expect((await pool.query("select title, start_time from travel_itinerary_items")).rows).toEqual(
      [{ title: "Meiji Gallery", start_time: "22:00:00" }],
    );
  });

  it("applies a budget split (total, existing and new categories) and restores it", async () => {
    nextAnswer = answer({
      kind: "budget",
      title: "Anggaran",
      budget: {
        total: 15_000_000,
        categories: [
          { name: "Makan & minum", amount: 3_000_000 },
          { name: "Penerbangan", amount: 5_000_000 },
        ],
      },
    });
    const proposal = proposalOf(await send("atur anggaran 15 juta", "budget"));
    await assistantApplyHandler({ data: { proposalId: proposal.id } });
    expect(
      Number((await pool.query("select total_budget_minor n from travel_trips")).rows[0].n),
    ).toBe(1_500_000_000);
    const cats = (
      await pool.query(
        "select name, allocated_minor::bigint::text a from travel_budget_categories order by name",
      )
    ).rows;
    expect(cats).toEqual([
      { name: "Makan & minum", a: "300000000" },
      { name: "Penerbangan", a: "500000000" },
    ]);
    await assistantUndoHandler({ data: { proposalId: proposal.id } });
    expect(
      Number((await pool.query("select total_budget_minor n from travel_trips")).rows[0].n),
    ).toBe(1_000_000_000);
    expect(
      (
        await pool.query(
          "select name, allocated_minor::bigint::text a from travel_budget_categories",
        )
      ).rows,
    ).toEqual([{ name: "Makan & minum", a: "0" }]);
  });

  it("adds checklist items and removes them on undo", async () => {
    nextAnswer = answer({
      kind: "checklist",
      title: "Persiapan",
      checklist: [
        { title: "Beli JR Pass", due: "2026-11-05" },
        { title: "Tukar yen", due: "" },
      ],
    });
    const proposal = proposalOf(await send("apa persiapan yang belum?", "checklist"));
    await assistantApplyHandler({ data: { proposalId: proposal.id } });
    expect(await count("select count(*)::int n from travel_checklist_items")).toBe(2);
    await assistantUndoHandler({ data: { proposalId: proposal.id } });
    expect(await count("select count(*)::int n from travel_checklist_items")).toBe(0);
  });

  it("logs a foreign-currency expense converted to the trip currency, and deletes it on undo", async () => {
    nextAnswer = answer({
      kind: "expense",
      title: "Catat biaya",
      expense: {
        description: "Ramen",
        amount: 1200,
        currency: "JPY",
        date: "2026-11-09",
        category: "Makan & minum",
      },
    });
    const proposal = proposalOf(await send("catat ramen 1200 yen", "expense"));
    await assistantApplyHandler({ data: { proposalId: proposal.id } });
    const row = (
      await pool.query(
        "select description, original_amount_minor::bigint::text o, converted_amount_minor::bigint::text c, converted_currency, category_id from travel_expenses",
      )
    ).rows[0];
    expect(row).toMatchObject({
      description: "Ramen",
      o: "120000",
      c: "12600000",
      converted_currency: "IDR",
    });
    expect(row.category_id).toBeTruthy();
    await assistantUndoHandler({ data: { proposalId: proposal.id } });
    expect(await count("select count(*)::int n from travel_expenses")).toBe(0);
  });

  it("dismisses a proposal without writing anything", async () => {
    nextAnswer = answer({ kind: "agenda", title: "x", agenda: [add("Tempat", "09:00")] });
    const proposal = proposalOf(await send("buatkan rencana", "plan"));
    await assistantDismissHandler({ data: { proposalId: proposal.id } });
    await expect(assistantApplyHandler({ data: { proposalId: proposal.id } })).rejects.toThrow(
      /sudah diproses/,
    );
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(1);
  });

  it("never lets another traveler read, send to, or apply this trip", async () => {
    nextAnswer = answer({ kind: "agenda", title: "x", agenda: [add("Tempat", "09:00")] });
    const proposal = proposalOf(await send("buatkan rencana", "plan"));
    holder.owner = { id: "u2", email: null, guest: false };
    await expect(assistantLoadHandler({ data: { tripId: TRIP } })).rejects.toThrow(
      /tidak ditemukan/,
    );
    await expect(send("halo")).rejects.toThrow(/tidak ditemukan/);
    await expect(assistantApplyHandler({ data: { proposalId: proposal.id } })).rejects.toThrow(
      /tidak ditemukan/,
    );
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(1);
  });

  it("stops at the daily limit and shows it to the traveler", async () => {
    await pool.query(
      `insert into admin_settings (setting_key, value_json, version) values ('tripAssistant', '{"dailyMessages":1}'::jsonb, 1)`,
    );
    nextAnswer = answer({ reply: "Halo!" });
    expect((await send("halo")).status).toBe("ok");
    const second = await send("halo lagi");
    expect(second).toMatchObject({ status: "limit", remaining: 0 });
    expect(await count("select count(*)::int n from travel_assistant_messages")).toBe(2);
  });

  it("follows the Admin switches: off, and guests", async () => {
    await pool.query(
      `insert into admin_settings (setting_key, value_json, version) values ('tripAssistant', '{"guestEnabled":false}'::jsonb, 1)`,
    );
    holder.owner = { id: "u1", email: null, guest: true };
    expect((await assistantLoadHandler({ data: { tripId: TRIP } })).status).toEqual({
      available: false,
      reason: "guest",
    });
    expect((await send("halo")).status).toBe("disabled");
    await pool.query(
      `update admin_settings set value_json='{"guestEnabled":true,"guestDailyMessages":2}'::jsonb`,
    );
    expect((await assistantLoadHandler({ data: { tripId: TRIP } })).status).toMatchObject({
      available: true,
      guest: true,
      remaining: 2,
    });
    await pool.query(`update admin_settings set value_json='{"enabled":false}'::jsonb`);
    expect((await assistantLoadHandler({ data: { tripId: TRIP } })).status).toEqual({
      available: false,
      reason: "off",
    });
  });

  it("refuses to apply when Admin turned that kind of change off", async () => {
    nextAnswer = answer({ kind: "agenda", title: "x", agenda: [add("Tempat", "09:00")] });
    const proposal = proposalOf(await send("buatkan rencana", "plan"));
    await pool.query(
      `insert into admin_settings (setting_key, value_json, version) values ('tripAssistant', '{"allowAgenda":false}'::jsonb, 1)`,
    );
    await expect(assistantApplyHandler({ data: { proposalId: proposal.id } })).rejects.toThrow(
      /dimatikan/,
    );
    expect(await count("select count(*)::int n from travel_itinerary_items")).toBe(1);
  });

  it("reports an AI failure without storing the message, and logs the failed run", async () => {
    failAi = true;
    const result = await send("halo");
    expect(result.status).toBe("error");
    expect(await count("select count(*)::int n from travel_assistant_messages")).toBe(0);
    expect((await pool.query("select status from travel_assistant_runs")).rows).toEqual([
      { status: "error" },
    ]);
  });

  it("resets a conversation and purges old history", async () => {
    nextAnswer = answer({ reply: "Halo!" });
    await send("halo");
    await assistantResetHandler({ data: { tripId: TRIP } });
    expect(await count("select count(*)::int n from travel_assistant_messages")).toBe(0);
    await pool.query(
      "insert into travel_assistant_messages (trip_id, customer_auth_subject, role, content, created_at) values ($1,'u1','user','lama', now() - interval '200 days')",
      [TRIP],
    );
    const out = await purgeAssistantHistory(Date.now() + 10 * 3_600_000);
    expect(out.messages).toBe(1);
  });

  describe("streaming, place checks, reminders", () => {
    const city = async () =>
      pool.query(
        "insert into travel_trip_cities (trip_id, name, latitude, longitude) values ($1,'Tokyo',35.68,139.76)",
        [TRIP],
      );
    const planAnswer = (items: ReturnType<typeof add>[]) =>
      answer({ kind: "agenda", title: "Hari ke-3", agenda: items });

    it("streams the reply in pieces and stores the same final messages", async () => {
      nextAnswer = answer({
        reply: "Halo, ini jawaban yang cukup panjang untuk dipotong.",
        chips: ["Ya"],
      });
      const seen: string[] = [];
      let done: unknown = null;
      for await (const event of assistantStreamHandler({ data: { tripId: TRIP, text: "halo" } })) {
        if (event.type === "delta") seen.push(event.text);
        if (event.type === "done") done = event.result;
      }
      expect(seen.length).toBeGreaterThan(2);
      expect(seen.join("")).toBe("Halo, ini jawaban yang cukup panjang untuk dipotong.");
      expect(done).toMatchObject({ status: "ok" });
      const history = await assistantLoadHandler({ data: { tripId: TRIP } });
      expect(history.messages.at(-1)).toMatchObject({
        content: "Halo, ini jawaban yang cukup panjang untuk dipotong.",
        chips: { options: ["Ya"] },
      });
      const run = (await pool.query("select tokens_in, tokens_out from travel_assistant_runs"))
        .rows[0];
      expect(run).toMatchObject({ tokens_in: 2000, tokens_out: 800 });
    });

    it("reports a streamed failure as a result, not a crash", async () => {
      failAi = true;
      const events: string[] = [];
      let done: { status?: string } = {};
      for await (const event of assistantStreamHandler({ data: { tripId: TRIP, text: "halo" } })) {
        events.push(event.type);
        if (event.type === "done") done = event.result;
      }
      expect(done.status).toBe("error");
      expect(events.at(-1)).toBe("done");
    });

    it("puts a pin and the real opening hours on proposed places, and flags a closed one", async () => {
      await city();
      nominatimRows["Shibuya Sky"] = {
        lat: "35.6582",
        lon: "139.7022",
        display_name: "Shibuya Sky, Shibuya, Tokyo",
        extratags: { opening_hours: "10:00-20:00" },
      };
      nominatimRows["Uobei Shibuya"] = {
        lat: "35.6594",
        lon: "139.6977",
        display_name: "Uobei, Shibuya, Tokyo",
        extratags: {},
      };
      nominatimRows["Tempat Jauh"] = {
        lat: "34.0",
        lon: "135.0",
        display_name: "Far away",
        extratags: { opening_hours: "24/7" },
      };
      nextAnswer = planAnswer([
        { ...add("Shibuya Sky", "16:30"), location: "", note: "cek jam buka" },
        { ...add("Uobei Shibuya", "18:30"), location: "", note: "" },
        { ...add("Shibuya Sky", "22:30"), title: "Shibuya Sky", location: "", note: "" },
        { ...add("Tempat Jauh", "12:00"), location: "", note: "" },
        { ...add("Tempat Tidak Ada", "13:00"), location: "", note: "" },
      ]);
      const proposal = proposalOf(await send("buatkan itinerary", "plan"));
      const items = (proposal.payload as { items: Item[] }).items;
      expect(items[0]).toMatchObject({ lat: 35.6582, hours: { raw: "10:00-20:00", open: true } });
      expect(items[0]!.note).toBe("Buka 10:00-20:00 (OpenStreetMap)");
      expect(items[1]).toMatchObject({ lat: 35.6594, hours: null });
      expect(items[1]!.note).toBe("cek jam buka");
      expect(items[2]!.hours).toMatchObject({ open: false });
      expect(items[2]!.note).toMatch(/^Mungkin tutup di jam ini: buka 10:00-20:00/);
      // Too far from the city, or not on the map at all: the activity still gets an approximate point
      // near the city centre, and the card says so. It is never put on the wrong side of the world.
      for (const i of [3, 4]) {
        expect(Math.abs(items[i]!.lat! - 35.68)).toBeLessThan(0.02);
        expect(Math.abs(items[i]!.lng! - 139.76)).toBeLessThan(0.02);
        expect(items[i]!.hours).toBeNull();
        expect(items[i]!.note).toBe("cek jam buka · titik perkiraan di peta");
      }
      expect([items[3]!.lat, items[3]!.lng]).not.toEqual([items[4]!.lat, items[4]!.lng]);

      await assistantApplyHandler({ data: { proposalId: proposal.id } });
      const saved = (
        await pool.query(
          "select title, latitude, longitude, notes from travel_itinerary_items where title='Shibuya Sky' order by start_time",
        )
      ).rows;
      expect(saved[0]).toMatchObject({ latitude: 35.6582, longitude: 139.7022 });
      expect(saved[0].notes).toContain("OpenStreetMap");
    });

    it("finds the area itself when the trip has no city yet, and looks places up by their own name", async () => {
      nominatimRows["Tsukiji, Tokyo"] = {
        lat: "35.665",
        lon: "139.77",
        display_name: "Tsukiji, Chuo, Tokyo",
        extratags: {},
      };
      nominatimRows["Hamarikyu Gardens"] = {
        lat: "35.66",
        lon: "139.763",
        display_name: "Hamarikyu Gardens, Chuo, Tokyo",
        extratags: { opening_hours: "09:00-17:00" },
      };
      nextAnswer = planAnswer([
        {
          ...add("Jalan santai di taman tepi laut", "10:30"),
          place: "Hamarikyu Gardens",
          location: "Tsukiji, Tokyo",
          note: "",
        },
      ]);
      const proposal = proposalOf(await send("buatkan itinerary", "plan"));
      const item = (proposal.payload as { items: Item[] }).items[0]!;
      expect(item).toMatchObject({ lat: 35.66, hours: { raw: "09:00-17:00", open: true } });
      expect(
        nominatimCalls.some(
          (u) =>
            new URL(u).searchParams.get("q") === "Tsukiji, Tokyo" &&
            !new URL(u).searchParams.has("bounded"),
        ),
      ).toBe(true);
    });

    it("adds the city of the new places to a trip that has none, and removes it on undo", async () => {
      nominatimRows["Tsukiji, Tokyo"] = {
        lat: "35.665",
        lon: "139.77",
        display_name: "Tsukiji, Chuo, Tokyo",
        extratags: {},
      };
      nominatimRows["Hamarikyu Gardens"] = {
        lat: "35.66",
        lon: "139.763",
        display_name: "Hamarikyu, Chuo, Tokyo",
        extratags: {},
      };
      nextAnswer = planAnswer([
        {
          ...add("Taman tepi laut", "10:30"),
          place: "Hamarikyu Gardens",
          location: "Tsukiji, Tokyo",
          note: "",
        },
      ]);
      const proposal = proposalOf(await send("buatkan itinerary", "plan"));
      await assistantApplyHandler({ data: { proposalId: proposal.id } });
      const city = (await pool.query("select name, latitude from travel_trip_cities")).rows;
      expect(city).toEqual([{ name: "Tokyo", latitude: 35.66 }]);
      await assistantUndoHandler({ data: { proposalId: proposal.id } });
      expect(await count("select count(*)::int n from travel_trip_cities")).toBe(0);
    });

    it("keeps an existing city untouched when applying", async () => {
      await city();
      nominatimRows["Shibuya Sky"] = {
        lat: "35.6582",
        lon: "139.7022",
        display_name: "Shibuya Sky, Tokyo",
        extratags: {},
      };
      nextAnswer = planAnswer([
        { ...add("Shibuya Sky", "16:30"), location: "Shibuya, Osaka", note: "" },
      ]);
      const proposal = proposalOf(await send("buatkan itinerary", "plan"));
      await assistantApplyHandler({ data: { proposalId: proposal.id } });
      expect((await pool.query("select name from travel_trip_cities")).rows).toEqual([
        { name: "Tokyo" },
      ]);
    });

    it("finds the new location of a place the AI renames, and keeps the old point when only the time changes", async () => {
      await city();
      await pool.query(
        "update travel_itinerary_items set latitude=35.7, longitude=139.7 where id=$1",
        [I1],
      );
      nominatimRows["The Roastery by Nozy Coffee"] = {
        lat: "35.6702",
        lon: "139.7054",
        display_name: "The Roastery, Jingumae, Tokyo",
        extratags: { opening_hours: "08:00-19:00" },
      };
      nextAnswer = answer({
        kind: "agenda",
        title: "Perbaiki pin",
        agenda: [
          {
            ...add("The Roastery by Nozy Coffee", "20:00"),
            op: "update",
            id: I1,
            date: "2026-11-08",
            location: "Jingumae, Shibuya, Tokyo",
            place: "The Roastery by Nozy Coffee",
          },
        ],
      });
      const proposal = proposalOf(await send("kenapa di peta tidak ada?", "tidy"));
      const item = (proposal.payload as { items: Item[] }).items[0]!;
      expect(item).toMatchObject({ lat: 35.6702, hours: { raw: "08:00-19:00", open: false } });
      await assistantApplyHandler({ data: { proposalId: proposal.id } });
      expect(
        (await pool.query("select title, latitude from travel_itinerary_items where id=$1", [I1]))
          .rows[0],
      ).toMatchObject({ title: "The Roastery by Nozy Coffee", latitude: 35.6702 });

      nextAnswer = answer({
        kind: "agenda",
        title: "Geser",
        agenda: [
          {
            ...add("", "21:00"),
            op: "update",
            id: I1,
            date: "2026-11-08",
            title: "",
            location: "",
            place: "",
          },
        ],
      });
      const second = proposalOf(await send("geser sedikit", "tidy"));
      await assistantApplyHandler({ data: { proposalId: second.id } });
      expect(
        Number(
          (await pool.query("select latitude from travel_itinerary_items where id=$1", [I1]))
            .rows[0].latitude,
        ),
      ).toBe(35.6702);
    });

    it("pins every activity without a point after Terapkan, and with the pin button", async () => {
      await city();
      await pool.query(
        `insert into travel_itinerary_items (trip_id, activity_date, start_time, title, location) values
       ($1,'2026-11-08','12:00','Ramen Afuri','Ebisu, Tokyo'), ($1,'2026-11-08','15:00','Tempat Misterius','')`,
        [TRIP],
      );
      nominatimRows["Ramen Afuri"] = {
        lat: "35.6466",
        lon: "139.7104",
        display_name: "Afuri, Ebisu, Tokyo",
        extratags: {},
      };
      nextAnswer = planAnswer([
        { ...add("Shibuya Sky", "16:30"), location: "Shibuya, Tokyo", note: "" },
      ]);
      nominatimRows["Shibuya Sky"] = {
        lat: "35.6582",
        lon: "139.7022",
        display_name: "Shibuya Sky, Tokyo",
        extratags: {},
      };
      const proposal = proposalOf(await send("buatkan itinerary", "plan"));
      const applied = await assistantApplyHandler({ data: { proposalId: proposal.id } });
      expect(applied.pinned).toBe(3); // Meiji Gallery (seed), Ramen Afuri, Tempat Misterius
      expect(
        await count("select count(*)::int n from travel_itinerary_items where latitude is null"),
      ).toBe(0);
      const afuri = (
        await pool.query("select latitude from travel_itinerary_items where title='Ramen Afuri'")
      ).rows[0];
      expect(Number(afuri.latitude)).toBe(35.6466); // found by its own name
      const lost = (
        await pool.query(
          "select latitude, longitude from travel_itinerary_items where title='Tempat Misterius'",
        )
      ).rows[0];
      expect(Math.abs(lost.latitude - 35.68)).toBeLessThan(0.02); // approximate, near the city

      await pool.query(
        "update travel_itinerary_items set latitude=null, longitude=null where title='Tempat Misterius'",
      );
      const pinned = await assistantPinHandler({ data: { tripId: TRIP } });
      expect(pinned).toMatchObject({ pinned: 1, approximate: 1, remaining: 0 });
    });

    it("only pins the owner's own trip", async () => {
      holder.owner = { id: "u2", email: null, guest: false };
      await expect(assistantPinHandler({ data: { tripId: TRIP } })).rejects.toThrow(
        /tidak ditemukan/,
      );
    });

    it("never guesses from seasonal or holiday hours", () => {
      expect(
        hoursNote(null, { raw: "Mo off; Oct 01-Mar 14 Tu-Su 09:00-16:30", open: null }, null),
      ).toBe("Jam buka berubah menurut musim atau hari libur: cek jam buka");
      expect(hoursNote(null, { raw: "10:00-20:00", open: null }, "10:00-20:00")).toBe(
        "Jam buka: 10:00-20:00 (OpenStreetMap)",
      );
      expect(hoursNote("makan malam", null, null)).toBe("makan malam · cek jam buka");
    });

    it("does not call the map when Admin turned the place check off, and still says cek jam buka", async () => {
      await city();
      await pool.query(
        `insert into admin_settings (setting_key, value_json, version) values ('tripAssistant', '{"verifyHours":false}'::jsonb, 1)`,
      );
      nextAnswer = planAnswer([{ ...add("Shibuya Sky", "16:30"), note: "" }]);
      const proposal = proposalOf(await send("buatkan itinerary", "plan"));
      expect(nominatimCalls).toHaveLength(0);
      expect((proposal.payload as { items: Item[] }).items[0]).toMatchObject({
        lat: null,
        hours: null,
      });
    });

    it("asks Nominatim politely: one at a time, bounded, cached", async () => {
      nominatimRows["Cache Cafe"] = {
        lat: "35.7",
        lon: "139.7",
        display_name: "Cache Cafe",
        extratags: {},
      };
      const near = { lat: 35.68, lng: 139.76 };
      const t0 = Date.now();
      await nominatimVenue("Cache Cafe", near);
      await nominatimVenue("Cache Cafe", near);
      expect(nominatimCalls).toHaveLength(1);
      expect(new URL(nominatimCalls[0]!).searchParams.get("bounded")).toBe("1");
      expect(Date.now() - t0).toBeLessThan(3000);
    });

    describe("reminders", () => {
      beforeEach(async () => {
        resetReminderThrottle();
        await pool.query("delete from travel_trips where id = $1", [TRIP]);
      });
      const jakartaMorning = () => Date.UTC(2026, 10, 9, 3, 0); // 10:00 Jakarta
      let clock = 0;
      const next = () => (clock += 31 * 60_000) + jakartaMorning();
      const trip = async (
        id: string,
        subject: string,
        depOffset: number,
        retOffset: number,
        budget = 0,
      ) =>
        pool.query(
          `insert into travel_trips (id,customer_auth_subject,name,destination_code,destination_name,departure_date,return_date,primary_currency,total_budget_minor)
         values ($1,$2,'Bali','ID','Bali',(now() at time zone 'Asia/Jakarta')::date + $3::int,(now() at time zone 'Asia/Jakarta')::date + $4::int,'IDR',$5)`,
          [id, subject, depOffset, retOffset, budget],
        );
      const notes = async () =>
        (
          await pool.query(
            "select recipient_customer_auth_subject s, title from customer_notifications order by title",
          )
        ).rows;

      it("sends one useful reminder to a member, once, and never to guests", async () => {
        await trip("22222222-2222-4222-8222-222222222222", "u1", 5, 9, 0);
        await trip("33333333-3333-4333-8333-333333333333", "guest:abc", 5, 9, 0);
        const first = await sweepAssistantReminders(next());
        expect(first).toMatchObject({ skipped: null, sent: 1 });
        expect(await notes()).toEqual([{ s: "u1", title: "Anggaran Bali belum diatur" }]);
        const again = await sweepAssistantReminders(next());
        expect(again.sent).toBe(0);
        expect(await notes()).toHaveLength(1);
      });

      it("sends at most one per traveler per day, even with two needy trips", async () => {
        await trip("22222222-2222-4222-8222-222222222222", "u1", 5, 9, 0);
        await trip("44444444-4444-4444-8444-444444444444", "u1", 6, 9, 0);
        expect((await sweepAssistantReminders(next())).sent).toBe(1);
        expect(await notes()).toHaveLength(1);
      });

      it("respects quiet hours, the Admin switch and trips that need nothing", async () => {
        await trip("22222222-2222-4222-8222-222222222222", "u1", 5, 9, 0);
        expect(
          (await sweepAssistantReminders(Date.UTC(2026, 10, 9, 18, 0) + (clock += 31 * 60_000)))
            .skipped,
        ).toBe("quiet_hours");
        resetReminderThrottle();
        await pool.query(
          `insert into admin_settings (setting_key, value_json, version) values ('tripAssistant', '{"reminders":false}'::jsonb, 1)`,
        );
        expect((await sweepAssistantReminders(next())).skipped).toBe("off");
        resetReminderThrottle();
        resetReminderThrottle();
        await pool.query("delete from admin_settings");
        await pool.query("delete from travel_trips where id <> $1", [TRIP]);
        await trip("55555555-5555-4555-8555-555555555555", "u1", 40, 45, 0);
        expect((await sweepAssistantReminders(next())).sent).toBe(0);
      });

      it("throttles itself to every half hour", async () => {
        const t = next();
        await sweepAssistantReminders(t);
        expect((await sweepAssistantReminders(t + 60_000)).skipped).toBe("throttled");
      });
    });
  });

  describe("sharing the itinerary (members and guests)", () => {
    beforeEach(async () => {
      await seed();
    });

    it("lets a guest owner create, read and close a read-only share link", async () => {
      holder.owner = { id: "guest:abc123", email: null, guest: true };
      await pool.query("update travel_trips set customer_auth_subject='guest:abc123'");
      expect(await readTripShareLink(TRIP)).toBeNull();
      const link = await createTripShareLink(TRIP);
      expect(link.token.length).toBeGreaterThan(20);
      expect(await readTripShareLink(TRIP)).toMatchObject({ token: link.token });
      // Anyone with the link sees the itinerary, and only that.
      const shared = (await loadSharedTrip(link.token)) as {
        trip?: { name?: string };
        itinerary?: unknown[];
      } | null;
      expect(shared).not.toBeNull();
      expect(JSON.stringify(shared)).toContain("Meiji Gallery");
      expect(JSON.stringify(shared)).not.toMatch(/customer_auth_subject|guest:abc123/);
      expect(await revokeTripShareLink(TRIP)).toEqual({ revoked: true });
      expect(await loadSharedTrip(link.token)).toBeNull();
    });

    it("works for a member too, and never for someone else's trip", async () => {
      holder.owner = { id: "u1", email: "a@b.c", guest: false };
      const link = await createTripShareLink(TRIP);
      expect(await loadSharedTrip(link.token)).not.toBeNull();
      holder.owner = { id: "u2", email: null, guest: false };
      await expect(createTripShareLink(TRIP)).rejects.toThrow(/tidak ditemukan/);
      await expect(readTripShareLink(TRIP)).rejects.toThrow(/tidak ditemukan/);
      expect(await revokeTripShareLink(TRIP)).toEqual({ revoked: false });
    });
  });
});

describe("trip assistant migration", () => {
  it.skipIf(!url)("is safe to run twice", async () => {
    const p = new pg.Pool({ connectionString: url });
    try {
      for (const file of ["058_trip_assistant", "060_travo_conversations"]) {
        const sql = readFileSync(resolve(`migrations/${file}.sql`), "utf8");
        await p.query(sql);
        await p.query(sql);
      }
    } finally {
      await p.end();
    }
  });
});
