import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sweep = vi.fn();

vi.mock("@/lib/mayar-settlement-sweep.server", () => ({
  sweepPendingProviderPayments: (...args: unknown[]) => sweep(...args),
}));

import { Route } from "@/routes/api.webhooks.mayar-forward";

const post = (
  Route.options as unknown as {
    server: { handlers: { POST: (context: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;

const SECRET = "travel-forward-test-secret";

function signedRequest(
  body: string,
  options?: { timestamp?: number; signature?: string; source?: string },
): Request {
  const timestamp = String(options?.timestamp ?? Math.floor(Date.now() / 1000));
  const signature =
    options?.signature ?? createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
  return new Request("https://djiwatravel.com/api/webhooks/mayar-forward", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-djiwa-source": options?.source ?? "djiwa-tentram",
      "x-djiwa-timestamp": timestamp,
      "x-djiwa-signature": signature,
    },
    body,
  });
}

describe("Mayar forward webhook", () => {
  beforeEach(() => {
    vi.stubEnv("DJIWA_TRAVEL_CALLBACK_SECRET", SECRET);
    sweep.mockReset();
    sweep.mockResolvedValue({ checked: 0, settled: 0, skipped: 0, failed: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects anything but POST", async () => {
    const response = await post({
      request: new Request("https://djiwatravel.com/api/webhooks/mayar-forward"),
    });
    expect(response.status).toBe(405);
  });

  it("rejects browser-originated calls", async () => {
    const request = signedRequest(JSON.stringify({ transactionId: "tx-1" }));
    request.headers.set("origin", "https://djiwatravel.com");
    expect((await post({ request })).status).toBe(403);
  });

  it("requires a JSON content type", async () => {
    const request = new Request("https://djiwatravel.com/api/webhooks/mayar-forward", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-djiwa-source": "djiwa-tentram" },
      body: "{}",
    });
    expect((await post({ request })).status).toBe(415);
  });

  it("requires the Tentram source header", async () => {
    const request = signedRequest(JSON.stringify({ transactionId: "tx-1" }), { source: "" });
    expect((await post({ request })).status).toBe(401);
  });

  it("rejects a valid body with the wrong signature", async () => {
    const request = signedRequest(JSON.stringify({ transactionId: "tx-1" }), {
      signature: "0".repeat(64),
    });
    expect((await post({ request })).status).toBe(401);
  });

  it("rejects a stale timestamp even when the signature matches", async () => {
    const request = signedRequest(JSON.stringify({ transactionId: "tx-1" }), {
      timestamp: Math.floor(Date.now() / 1000) - 600,
    });
    expect((await post({ request })).status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    expect((await post({ request: signedRequest("{") })).status).toBe(400);
  });

  it("rejects a payload without provider identifiers", async () => {
    const response = await post({ request: signedRequest(JSON.stringify({ app: "x" })) });
    expect(response.status).toBe(400);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("narrows the sweep to the forwarded identifiers", async () => {
    sweep.mockResolvedValue({ checked: 1, settled: 1, skipped: 0, failed: 0 });
    const response = await post({
      request: signedRequest(
        JSON.stringify({ transactionId: "tx-9", invoiceId: "inv-9" }),
      ),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, settled: 1 });
    expect(sweep).toHaveBeenCalledWith({
      graceMinutes: 0,
      limit: 5,
      match: { transactionId: "tx-9", invoiceId: "inv-9" },
    });
  });

  it("answers 200 with zero checks for another app's invoice", async () => {
    const response = await post({
      request: signedRequest(JSON.stringify({ transactionId: "tentram-tx" })),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, checked: 0, settled: 0 });
  });
});
