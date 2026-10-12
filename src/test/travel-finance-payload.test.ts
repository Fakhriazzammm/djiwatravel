import { describe, expect, it } from "vitest";
import { buildTravelFinanceGatewayPayload, parseTravelFinanceGatewayResponse } from "../lib/mayar-settlement.server";

// The finance gateway validates `customerName` with a helper that accepts only a string or null:
// omitting the key made every settlement fail with invalid_request, so the key must always exist.
describe("travel finance settlement payload", () => {
  const base = {
    orderId: "2eb659a8-90ed-458c-8b04-4522b3e02d35",
    orderNumber: "D17FAF441F7B8953F5EC53BD",
    amount: 15_000,
    paidAt: 1_791_799_335_337,
    invoiceId: "b9a38028-6663-413e-a4dd-03caca84ee6e",
    transactionId: "ce920357-a16b-45dc-8560-79fd4543cc40",
  };

  it("always carries customerName, using null when the customer is unknown", () => {
    const payload = buildTravelFinanceGatewayPayload(base);
    expect("customerName" in payload).toBe(true);
    expect(payload.customerName).toBeNull();
    expect(JSON.parse(JSON.stringify(payload)).customerName).toBeNull();
  });

  it("keeps a bounded customer name when one is known", () => {
    const payload = buildTravelFinanceGatewayPayload({ ...base, customerName: "  Fakhri Azzam  " });
    expect(payload.customerName).toBe("Fakhri Azzam");
    const long = buildTravelFinanceGatewayPayload({ ...base, customerName: "a".repeat(400) });
    expect(long.customerName?.length).toBe(120);
  });

  it("sends only the allowlisted gateway identifiers", () => {
    const payload = buildTravelFinanceGatewayPayload({ ...base, customerName: null });
    expect(Object.keys(payload.paymentGateway).sort()).toEqual(["invoiceId", "provider", "status", "transactionId"]);
    expect(payload.amount).toBe(15_000);
  });

  it("accepts the gateway answer shapes it documents", () => {
    expect(parseTravelFinanceGatewayResponse({ ok: true, dedup: true })).toEqual({ ok: true, dedup: true });
    expect(parseTravelFinanceGatewayResponse({ ok: true, dedup: false, sourceId: "fin_mayar_abc" }))
      .toEqual({ ok: true, dedup: false, sourceId: "fin_mayar_abc" });
    expect(() => parseTravelFinanceGatewayResponse({ dedup: true })).toThrow();
  });
});
