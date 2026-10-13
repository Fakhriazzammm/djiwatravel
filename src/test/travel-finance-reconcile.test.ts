import { describe, expect, it } from "vitest";
import { ledgerStatusUrl, parseLedgerStatus } from "../lib/travel-finance-reconcile.server";

// The ledger-status endpoint must live on the same host as the settlement endpoint we already
// configure, so a host change cannot silently point reconciliation at a different finance stack.
describe("travel finance ledger status url", () => {
  it("derives the status endpoint from the settlement endpoint", () => {
    expect(ledgerStatusUrl("https://supabase.yumme.id/functions/v1/travel-finance-settlement"))
      .toBe("https://supabase.yumme.id/functions/v1/travel-finance-ledger-status");
  });

  it("refuses a url it does not recognise instead of guessing a sibling path", () => {
    expect(() => ledgerStatusUrl("https://supabase.yumme.id/functions/v1/other")).toThrow();
  });
});

// `missing` decides which orders get re-posted: an unparsed or unsolicited id would either re-post
// an already recorded payment or hide a genuinely lost one.
describe("travel finance ledger status response", () => {
  it("reports which settled orders the ledger does not hold", () => {
    const result = parseLedgerStatus(["order-a", "order-b"], { ok: true, checked: 2, found: 1, missing: ["order-b"] });
    expect(result.missing).toEqual(["order-b"]);
    expect(result.found).toEqual(["order-a"]);
  });

  it("ignores ids it never asked about", () => {
    const result = parseLedgerStatus(["order-a"], { ok: true, missing: ["order-a", "order-injected"] });
    expect(result.missing).toEqual(["order-a"]);
  });

  it("fails instead of treating a malformed answer as 'everything is recorded'", () => {
    expect(() => parseLedgerStatus(["order-a"], { ok: false, missing: [] })).toThrow();
    expect(() => parseLedgerStatus(["order-a"], null)).toThrow();
    expect(() => parseLedgerStatus(["order-a"], { ok: true })).toThrow();
  });
});
