import { describe, expect, it } from "vitest";
import { mapPostgresOrderRow } from "../lib/postgres-reseller-repository";
describe("mapPostgresOrderRow", () =>
  it("maps persisted values", () => {
    const createdAt = new Date("2026-10-05T00:00:00Z");
    const result = mapPostgresOrderRow({
      id: "1",
      status: "PAYMENT_PENDING",
      total_amount: "125000",
      currency_code: "IDR",
      idempotency_key: "k",
      package_code: "TH",
      created_at: createdAt,
      price_snapshot: {},
      provider_order_no: null,
      provider_status: null,
      expires_at: null,
    });
    expect(result).toMatchObject({ id: "1", totalAmount: 125000, createdAt: createdAt.getTime() });
  }));

it("omits optional persistence fields when database columns are null", () => {
  const result = mapPostgresOrderRow({
    id: "2",
    status: "DRAFT",
    total_amount: 0,
    currency_code: "IDR",
    idempotency_key: "k2",
    package_code: "TH",
    created_at: "2026-10-05T00:00:00Z",
    price_snapshot: null,
    provider_order_no: null,
    provider_status: null,
    expires_at: null,
  });
  expect(result).not.toHaveProperty("priceSnapshot");
  expect(result).not.toHaveProperty("providerOrderNo");
  expect(result).not.toHaveProperty("providerStatus");
  expect(result).not.toHaveProperty("expiresAt");
});
