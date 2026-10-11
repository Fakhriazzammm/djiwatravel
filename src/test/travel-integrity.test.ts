import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { claimPaymentIntent, markProviderTimeout } from "@/lib/payment-intent";
import { effectivePaymentStatus, isPaymentExpired } from "@/lib/payment-expiry";
import { isInstallableProfile } from "@/lib/esim-readiness";

describe("travel payment/provisioning integrity", () => {
  it("reuses a durable payment claim instead of creating another invoice", () => {
    const existing = { orderId: "o1", provider: "mayar", idempotencyKey: "o1", status: "UNKNOWN" as const, amount: 1000, currency: "IDR" };
    expect(claimPaymentIntent(existing, { ...existing }).action).toBe("reuse");
    expect(markProviderTimeout({ ...existing, status: "REQUESTING" })).toMatchObject({ status: "UNKNOWN" });
  });

  it("expires only unpaid orders and leaves READY/INSTALLED on activation expiry", () => {
    const expired = Date.parse("2026-01-01T00:00:00Z");
    expect(isPaymentExpired("PAYMENT_PENDING", expired, expired)).toBe(true);
    expect(effectivePaymentStatus("PAYMENT_PENDING", expired, expired)).toBe("EXPIRED");
    expect(effectivePaymentStatus("READY", expired, expired)).toBe("READY");
    expect(effectivePaymentStatus("INSTALLED", expired, expired)).toBe("INSTALLED");
  });

  it("keeps rebuild and webhook transitions behind durable/profile guards", () => {
    // DB/provider integration is not available in this isolated worktree; this contract test pins
    // the production boundaries until the migration-backed integration harness is available.
    const root = process.cwd();
    const gateway = readFileSync(resolve(root, "src/lib/mayar-gateway.ts"), "utf8");
    const webhook = readFileSync(resolve(root, "src/routes/api.webhooks.esim-access.$token.ts"), "utf8");
    expect(gateway.match(/createMayarInvoiceForOrder\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(gateway).toContain("on conflict (order_id, provider) do nothing returning id");
    expect(webhook).not.toContain("set status = 'READY', updated_at = now() where id = ${row.order_id}");
    expect(webhook).toContain("installable = true");
  });

  it("does not publish READY without an installable profile", () => {
    expect(isInstallableProfile(null)).toBe(false);
    expect(isInstallableProfile({ iccid: "8901" })).toBe(false);
    expect(isInstallableProfile({ iccid: "8901", qrPayloadEncrypted: "ciphertext" })).toBe(true);
  });
});
