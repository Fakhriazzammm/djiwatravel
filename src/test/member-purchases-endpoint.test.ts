import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("@/db/client.server", () => {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "from", "innerJoin", "leftJoin", "where"])
    chain[name] = () => chain;
  chain["orderBy"] = async () => rows.value;
  return { db: chain };
});

import { Route } from "@/routes/api.internal.member-purchases";

const post = (
  Route.options as unknown as {
    server: { handlers: { POST: (context: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;

const SECRET = "member-purchases-test-secret";

function signed(body: string, options?: { signature?: string; source?: string }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature =
    options?.signature ?? createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
  return new Request("https://djiwatravel.com/api/internal/member-purchases", {
    method: "POST",
    headers: {
      "x-djiwa-source": options?.source ?? "djiwa-tentram",
      "x-djiwa-timestamp": timestamp,
      "x-djiwa-signature": signature,
    },
    body,
  });
}

const order = (over: Record<string, unknown>) => ({
  id: "o1",
  code: "CODE1",
  status: "READY",
  amount: "154000",
  paidAt: "2026-11-02T11:32:35Z",
  createdAt: "2026-11-02T11:32:05Z",
  provider: "mayar",
  method: null,
  snapshot: { name: "Middle East 5GB" },
  ...over,
});

describe("member purchases endpoint", () => {
  beforeEach(() => {
    vi.stubEnv("DJIWA_TRAVEL_CALLBACK_SECRET", SECRET);
    rows.value = [];
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects unsigned, wrongly signed and browser calls", async () => {
    const body = JSON.stringify({ sourceId: "u1" });
    expect((await post({ request: signed(body, { signature: "bad" }) })).status).toBe(401);
    expect((await post({ request: signed(body, { source: "other" }) })).status).toBe(401);
    const browser = signed(body);
    browser.headers.set("origin", "https://djiwatravel.com");
    expect((await post({ request: browser })).status).toBe(403);
  });

  it("validates the payload", async () => {
    expect((await post({ request: signed("not json") })).status).toBe(400);
    expect((await post({ request: signed(JSON.stringify({})) })).status).toBe(400);
  });

  it("returns only paid purchases with display fields", async () => {
    rows.value = [
      order({}),
      order({ id: "o2", status: "EXPIRED" }),
      order({ id: "o3", status: "WAITING_PAYMENT" }),
    ];
    const response = await post({ request: signed(JSON.stringify({ sourceId: "u1" })) });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { purchases: Array<Record<string, unknown>> };
    expect(payload.purchases).toHaveLength(1);
    expect(payload.purchases[0]).toMatchObject({
      orderId: "o1",
      orderCode: "CODE1",
      title: "eSIM Middle East 5GB",
      amount: 154000,
      method: "qris",
    });
    expect(Object.keys(payload.purchases[0]!)).not.toContain("paymentUrl");
  });
});
