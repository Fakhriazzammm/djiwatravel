import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deliveryStatusFor,
  eventKey,
  overridesDelivered,
  parseHelipodEvent,
  signHelipodBody,
  verifyHelipodSignature,
} from "@/lib/helipod-email-webhook";

const SECRET = "whsec_test_secret";
const NOW = Date.parse("2026-11-20T16:00:00Z");

describe("Helipod webhook signature", () => {
  const body = JSON.stringify({ type: "email.delivered", data: { recipients: ["a@b.id"] } });

  it("accepts a correct signature and rejects a changed body or secret", () => {
    const header = signHelipodBody(body, SECRET, NOW);
    expect(verifyHelipodSignature(body, header, SECRET, NOW)).toBe(true);
    expect(verifyHelipodSignature(body + " ", header, SECRET, NOW)).toBe(false);
    expect(verifyHelipodSignature(body, header, "other", NOW)).toBe(false);
  });

  it("rejects missing, malformed and replayed headers", () => {
    const header = signHelipodBody(body, SECRET, NOW);
    expect(verifyHelipodSignature(body, null, SECRET, NOW)).toBe(false);
    expect(verifyHelipodSignature(body, "garbage", SECRET, NOW)).toBe(false);
    expect(verifyHelipodSignature(body, "t=abc,v1=00", SECRET, NOW)).toBe(false);
    // Older or newer than five minutes is a replay.
    expect(verifyHelipodSignature(body, header, SECRET, NOW + 301_000)).toBe(false);
    expect(verifyHelipodSignature(body, header, SECRET, NOW - 301_000)).toBe(false);
    expect(verifyHelipodSignature(body, header, SECRET, NOW + 200_000)).toBe(true);
    expect(verifyHelipodSignature(body, header, "", NOW)).toBe(false);
  });
});

describe("Helipod event parsing", () => {
  it("reads a bounce with its diagnostic and recipient", () => {
    const event = parseHelipodEvent({
      type: "email.bounced",
      createdAt: "2026-11-20T10:00:00.000Z",
      data: {
        messageId: "abc123",
        recipients: ["Ana@Example.ID"],
        notification: {
          type: "bounce",
          mail: { subject: "Pre-order siap" },
          bounce: {
            bounceType: "Permanent",
            recipients: [
              { emailAddress: "ana@example.id", diagnosticCode: "smtp; 550 user unknown" },
            ],
          },
        },
      },
    });
    expect(event).toMatchObject({
      type: "email.bounced",
      messageId: "abc123",
      recipients: ["ana@example.id"],
      subject: "Pre-order siap",
      detail: "smtp; 550 user unknown",
    });
  });

  it("rejects anything that is not an email event", () => {
    expect(parseHelipodEvent(null)).toBeNull();
    expect(parseHelipodEvent({ type: "order.paid" })).toBeNull();
    expect(parseHelipodEvent({ type: "email.<script>" })).toBeNull();
  });

  it("maps outcome events and lets a bounce beat a delivery", () => {
    expect(deliveryStatusFor("email.delivered")).toBe("delivered");
    expect(deliveryStatusFor("email.complained")).toBe("complained");
    expect(deliveryStatusFor("email.opened")).toBeNull();
    expect(overridesDelivered("delivered")).toBe(false);
    expect(overridesDelivered("bounced")).toBe(true);
    expect(eventKey("email.bounced", "m1", "a@b.id")).toBe("email.bounced|m1|a@b.id");
  });
});

/* ---------------------------------------------------------------- the route handler */

const db = vi.hoisted(() => ({
  seen: new Set<string>(),
  outbox: { id: "out-1", deliveryStatus: null as string | null },
  failUpdate: false,
  log: [] as string[],
}));

vi.mock("@/db/client.server", () => ({
  pool: {
    connect: async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        const text = sql.replace(/\s+/g, " ").trim();
        db.log.push(text.split(" ").slice(0, 3).join(" "));
        if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };
        if (text.startsWith("insert into public.travel_email_events")) {
          const key = String(params[0]);
          if (db.seen.has(key)) return { rows: [] };
          db.seen.add(key);
          return { rows: [{ event_key: key }] };
        }
        if (text.startsWith("select id from public.travel_email_outbox"))
          return { rows: [{ id: db.outbox.id }] };
        if (text.startsWith("update public.travel_email_outbox")) {
          if (db.failUpdate) throw new Error("db down");
          const overrides = Boolean(params[4]);
          if (
            overrides ||
            db.outbox.deliveryStatus === null ||
            db.outbox.deliveryStatus === "delivered"
          ) {
            db.outbox.deliveryStatus = String(params[1]);
            return { rows: [{ id: db.outbox.id }] };
          }
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => undefined,
    }),
  },
}));

import { handleHelipodEmailWebhook } from "@/lib/helipod-email-webhook.server";

const send = (payload: unknown, opts: { secret?: string; header?: string | null } = {}) => {
  const raw = JSON.stringify(payload);
  const header =
    opts.header === undefined ? signHelipodBody(raw, opts.secret ?? SECRET) : opts.header;
  return handleHelipodEmailWebhook(
    new Request("https://djiwatravel.com/api/webhooks/helipod-email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(header ? { "helipod-signature": header } : {}),
      },
      body: raw,
    }),
  );
};
const event = (type: string, messageId = "m1") => ({
  type,
  createdAt: new Date().toISOString(),
  data: { messageId, recipients: ["ana@example.id"], notification: {} },
});

beforeEach(() => {
  db.seen.clear();
  db.outbox.deliveryStatus = null;
  db.failUpdate = false;
  db.log.length = 0;
  process.env["HELIPOD_EMAIL_WEBHOOK_SECRET"] = SECRET;
});

describe("Helipod email webhook handler", () => {
  it("answers 503 without a secret and 401 for a missing or wrong signature", async () => {
    delete process.env["HELIPOD_EMAIL_WEBHOOK_SECRET"];
    expect((await send(event("email.delivered"))).status).toBe(503);
    process.env["HELIPOD_EMAIL_WEBHOOK_SECRET"] = SECRET;
    expect((await send(event("email.delivered"), { header: null })).status).toBe(401);
    expect((await send(event("email.delivered"), { secret: "wrong" })).status).toBe(401);
    expect(db.log).toHaveLength(0);
  });

  it("records a delivery once and ignores a repeat", async () => {
    const first = await (await send(event("email.delivered"))).json();
    expect(first).toMatchObject({ ok: true, recorded: 1, applied: 1 });
    expect(db.outbox.deliveryStatus).toBe("delivered");
    const second = await (await send(event("email.delivered"))).json();
    expect(second).toMatchObject({ ok: true, recorded: 0, applied: 0 });
  });

  it("keeps a bounce even when the delivery event arrives after it", async () => {
    await send(event("email.bounced", "m2"));
    expect(db.outbox.deliveryStatus).toBe("bounced");
    await send(event("email.delivered", "m2"));
    expect(db.outbox.deliveryStatus).toBe("bounced");
  });

  it("records engagement events without changing the outcome and ignores received mail", async () => {
    await send(event("email.delivered"));
    const opened = await (await send(event("email.opened"))).json();
    expect(opened).toMatchObject({ recorded: 1, applied: 0 });
    expect(db.outbox.deliveryStatus).toBe("delivered");
    expect(await (await send(event("email.received"))).json()).toMatchObject({ ignored: true });
    expect(await (await send({ type: "order.paid" })).json()).toMatchObject({ ignored: true });
  });

  it("rolls back and answers 500 so Helipod retries when the database fails", async () => {
    db.failUpdate = true;
    const response = await send(event("email.bounced", "m3"));
    expect(response.status).toBe(500);
    expect(db.log).toContain("rollback");
  });
});
