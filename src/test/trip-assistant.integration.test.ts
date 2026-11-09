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
vi.mock("@/lib/google-calendar.server", () => ({
  syncItineraryItem: async () => undefined,
  renameGoogleFiles: async () => undefined,
}));

import {
  assistantApplyHandler,
  assistantDismissHandler,
  assistantLoadHandler,
  assistantResetHandler,
  assistantSendHandler,
  assistantUndoHandler,
  clearAssistantBurst,
  purgeAssistantHistory,
} from "@/lib/trip-assistant.server";

const TRIP = "11111111-1111-4111-8111-111111111111";
const I1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
let pool: pg.Pool;
let nextAnswer: unknown = null;
let failAi = false;

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
    "018_my_trips",
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
  ])
    await pool.query(readFileSync(resolve(`migrations/${file}.sql`), "utf8"));
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
      vi.fn(async (input: string | URL) => {
        const target = String(input);
        if (target.includes("frankfurter"))
          return new Response(JSON.stringify({ date: "2026-11-09", rates: { IDR: 105 } }), {
            status: 200,
          });
        if (failAi) return new Response("boom", { status: 500 });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(nextAnswer) } }],
            usage: { prompt_tokens: 2000, completion_tokens: 800 },
          }),
          { status: 200 },
        );
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
    clearAssistantBurst();
    await seed();
    await pool.query("delete from travel_assistant_messages");
    await pool.query("delete from travel_assistant_proposals");
    await pool.query("delete from travel_assistant_runs");
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
});

describe("trip assistant migration", () => {
  it.skipIf(!url)("is safe to run twice", async () => {
    const p = new pg.Pool({ connectionString: url });
    try {
      const sql = readFileSync(resolve("migrations/058_trip_assistant.sql"), "utf8");
      await p.query(sql);
      await p.query(sql);
    } finally {
      await p.end();
    }
  });
});
