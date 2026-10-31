import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildTravelWalletChargeRequest,
  djiwaTravelWalletIdempotencyKey,
  parseDjiwaPayChargeResponse,
} from "../lib/djiwa-pay-payment-contract";

describe("Djiwa Pay direct wallet charge contract", () => {
  it("signs the server-owned order and amount while forwarding the session cookie", () => {
    const timestamp = "1798761600000";
    const secret = "test-only-travel-wallet-secret-long-enough";
    const request = buildTravelWalletChargeRequest({
      orderId: "2f7fb843-fdd1-49e6-9ad8-e0a2dabba028",
      amount: 25_000,
      cookie: "djiwa_session=verified-cookie",
      secret,
      timestamp,
    });
    const body = '{"orderId":"2f7fb843-fdd1-49e6-9ad8-e0a2dabba028","amount":25000}';
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

    expect(request.body).toBe(body);
    expect(request.headers).toMatchObject({
      cookie: "djiwa_session=verified-cookie",
      "x-travel-timestamp": timestamp,
      "x-travel-signature": signature,
    });
    expect(djiwaTravelWalletIdempotencyKey("2f7fb843-fdd1-49e6-9ad8-e0a2dabba028")).toBe(
      "djiwa-travel-order:2f7fb843-fdd1-49e6-9ad8-e0a2dabba028",
    );
  });

  it("maps confirmed, insufficient, and unknown Pay responses to safe outcomes", () => {
    expect(parseDjiwaPayChargeResponse(200, {
      success: true,
      status: "already_charged",
      transactionId: "81",
    })).toEqual({ kind: "paid", transactionId: "81" });
    expect(parseDjiwaPayChargeResponse(409, {
      success: false,
      error: "INSUFFICIENT_BALANCE",
      balance: 2_000,
    })).toEqual({ kind: "insufficient_balance", balance: 2_000 });
    expect(parseDjiwaPayChargeResponse(503, {
      success: false,
      error: "PAYMENT_RESULT_UNKNOWN",
    })).toEqual({ kind: "pending" });
  });
});
