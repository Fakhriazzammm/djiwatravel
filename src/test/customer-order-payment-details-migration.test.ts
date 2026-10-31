import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/030_customer_order_payment_details.sql", "utf8").replace(
  /\s+/g,
  " ",
);

describe("migration 030: customer_order_payment_details", () => {
  it("creates the neutral payment-contact table idempotently", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.customer_order_payment_details/);
    expect(sql).toMatch(/order_id uuid PRIMARY KEY REFERENCES public\.customer_orders\(id\)/);
    expect(sql).toMatch(
      /ALTER TABLE public\.customer_order_payment_details ENABLE ROW LEVEL SECURITY/,
    );
  });

  it("backfills from guest_order_access without overwriting existing rows", () => {
    expect(sql).toMatch(/INSERT INTO public\.customer_order_payment_details/);
    expect(sql).toMatch(/FROM public\.guest_order_access/);
    expect(sql).toMatch(/ON CONFLICT \(order_id\) DO NOTHING/);
  });

  it("never deletes or rewrites historical order, guest, or audit rows", () => {
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/ALTER TABLE public\.(customer_orders|guest_order_access)\b/i);
  });

  it("restricts payment_method to the values the schema accepts", () => {
    expect(sql).toMatch(/CHECK \(payment_method = ANY \(ARRAY\['qris', ?'va', ?'djiwa_pay'\]\)\)/);
  });
});
