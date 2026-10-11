import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "migrations/010_mayar_travel_finance_ledger.sql"),
  "utf8",
);

describe("Travel Mayar finance settlement contract", () => {
  it("uses the canonical finance RPC and fails on missing prerequisites", () => {
    expect(migration).toContain("to_regclass('pos.financial_transactions')");
    expect(migration).toContain(
      "to_regprocedure('pos.record_mayar_financial_transaction(text,text,numeric,text,double precision,jsonb)')",
    );
    expect(migration).toContain(
      "v_ledger := pos.record_mayar_financial_transaction(",
    );
    expect(migration).toContain("raise exception 'finance_ledger_failed'");
    expect(migration).not.toContain("create table pos.financial_transactions");
  });

  it("makes duplicate settlement safe and keeps raw callback data out of ledger metadata", () => {
    expect(migration).toContain(
      "v_ledger := pos.record_mayar_financial_transaction(",
    );
    expect(migration).toContain(
      "where provider = 'mayar' and provider_event_id = p_event_id",
    );
    expect(migration).toContain(
      "return jsonb_build_object('duplicate', true, 'ledger', v_ledger)",
    );
    expect(migration).toContain("v_gateway := jsonb_build_object(");
    expect(migration).toContain(
      "'transactionId', nullif(btrim(p_transaction_id), '')",
    );
    const gatewaySection = migration.slice(
      migration.indexOf("v_gateway := jsonb_build_object("),
      migration.indexOf("v_ledger := pos.record_mayar_financial_transaction("),
    );
    expect(gatewaySection).not.toContain("p_payload");
    expect(gatewaySection).not.toContain("qr");
    expect(gatewaySection).not.toContain("activation");
  });

  it("posts the ledger before recording the webhook event and returning settled", () => {
    const ledgerPosition = migration.indexOf(
      "v_ledger := pos.record_mayar_financial_transaction(",
    );
    const eventInsertPosition = migration.indexOf(
      "insert into public.payment_webhook_events",
    );
    const settledPosition = migration.indexOf("'settled', true");
    expect(ledgerPosition).toBeGreaterThan(-1);
    expect(eventInsertPosition).toBeGreaterThan(ledgerPosition);
    expect(settledPosition).toBeGreaterThan(eventInsertPosition);
  });
});
