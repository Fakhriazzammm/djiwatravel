import { describe, expect, it, vi } from "vitest";
import {
  requireBetterAuthUser,
  resolveCanonicalCustomerIdentity,
  resolveCanonicalCustomerSourceId,
} from "../lib/customer-profile.server";
import { receive } from "../routes/api.djiwa-pay.topup";
import {
  canonicalTopupPayload,
  parseCanonicalTopupResponse,
  resolveVerifiedCanonicalCustomerSourceId,
  validateTopupAmount,
} from "../lib/djiwa-pay-topup.server";

describe("Djiwa Pay Travel top-up boundary", () => {
  it("rejects unauthenticated requests before reading a wallet identity", async () => {
    await expect(requireBetterAuthUser("")).rejects.toThrow("Autentikasi diperlukan");
  });

  it("returns 401 for a direct HTTP request without a session before any wallet call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await receive(
      new Request("https://djiwatravel.com/api/djiwa-pay/topup", {
        method: "POST",
        body: JSON.stringify({ amount: 25000, idempotencyKey: "travel_topup_123456" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Autentikasi diperlukan" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces integer IDR and the canonical minimum server-side", () => {
    expect(validateTopupAmount(1000)).toBe(1000);
    expect(() => validateTopupAmount(999)).toThrow(/minimal/);
    expect(() => validateTopupAmount(1000.5)).toThrow(/rupiah bulat/);
    expect(() => validateTopupAmount(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it("accepts only a pending canonical invoice and rejects malformed/error responses", () => {
    expect(
      parseCanonicalTopupResponse({
        topup_id: "wt_1",
        invoice_id: "inv_1",
        invoice_url: "https://mayar.example/inv_1",
        status: "pending",
      }),
    ).toMatchObject({ status: "pending" });
    expect(() =>
      parseCanonicalTopupResponse({ status: "paid", invoice_url: "https://mayar.example/inv_1" }),
    ).toThrow(/Respons invoice/);
  });

  it("maps a verified auth cookie to the canonical customer source id", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(
          JSON.stringify({
            customer: { source_id: " djiwa-customer-1 ", email: "A@EXAMPLE.COM", name: "A" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveCanonicalCustomerSourceId("a@example.com", "better-auth-session=secret"),
    ).resolves.toBe("djiwa-customer-1");
    await expect(
      resolveCanonicalCustomerIdentity("a@example.com", "better-auth-session=secret"),
    ).resolves.toEqual({ sourceId: "djiwa-customer-1", email: "A@EXAMPLE.COM" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.djiwatentram.web.id/api/customer/profile",
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "better-auth-session=secret" }),
      }),
    );
  });

  it.each([
    [
      "email mismatch",
      new Response(
        JSON.stringify({ customer: { source_id: "canonical-1", email: "other@example.com" } }),
        { status: 200 },
      ),
    ],
    ["unavailable", new Response("", { status: 503 })],
    [
      "malformed",
      new Response(JSON.stringify({ customer: { email: "a@example.com" } }), { status: 200 }),
    ],
  ])("rejects %s canonical profile responses", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(
      resolveVerifiedCanonicalCustomerSourceId({ email: "a@example.com" }),
    ).rejects.toThrow(/pemetaan identitas/);
  });

  it("uses the returned canonical source id, never Better Auth user.id, in the wallet payload", () => {
    const payload = canonicalTopupPayload({
      amount: 25000,
      idempotencyKey: "travel_topup_123456",
      canonicalCustomerIdentity: { sourceId: "djiwa-customer-1", email: "A@EXAMPLE.COM" },
    });
    expect(payload).toMatchObject({ sourceId: "djiwa-customer-1", email: "A@EXAMPLE.COM" });
    expect(payload.sourceId).not.toBe("better-auth-user-1");
  });
});
