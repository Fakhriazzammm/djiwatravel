import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AFFILIATE_CODE_PATTERN,
  DEFAULT_AFFILIATE_CONFIG,
  affiliateLink,
  computeCommissionIdr,
  generateAffiliateCode,
  maskAccountNumber,
  maskedReferee,
  normalizeAffiliateCode,
  normalizeAffiliateConfig,
  parseAffiliateConfig,
  parseBankDestination,
  validateCustomCode,
} from "@/lib/affiliate";

const read = (path: string) => readFileSync(path, "utf8");

describe("affiliate rules", () => {
  it("computes commission on margin, rounded down, never negative", () => {
    expect(computeCommissionIdr(100_000, 10)).toBe(10_000);
    expect(computeCommissionIdr(12_345, 10)).toBe(1_234);
    expect(computeCommissionIdr(0, 10)).toBe(0);
    expect(computeCommissionIdr(-5, 10)).toBe(0);
    expect(computeCommissionIdr(1000, 250)).toBe(1000);
    expect(computeCommissionIdr(Number.NaN, 10)).toBe(0);
  });

  it("normalizes config defensively but parses strictly for admin writes", () => {
    expect(normalizeAffiliateConfig(null)).toEqual(DEFAULT_AFFILIATE_CONFIG);
    expect(
      normalizeAffiliateConfig({ commissionPercent: 500, holdDays: "x" }).commissionPercent,
    ).toBe(10);
    expect(
      parseAffiliateConfig({ ...DEFAULT_AFFILIATE_CONFIG, commissionPercent: 12.5 })
        .commissionPercent,
    ).toBe(12.5);
    expect(() =>
      parseAffiliateConfig({ ...DEFAULT_AFFILIATE_CONFIG, commissionPercent: 101 }),
    ).toThrow();
    expect(() => parseAffiliateConfig({ ...DEFAULT_AFFILIATE_CONFIG, holdDays: 1.5 })).toThrow();
    expect(() => parseAffiliateConfig({ ...DEFAULT_AFFILIATE_CONFIG, enabled: "yes" })).toThrow();
  });

  it("generates and validates codes", () => {
    const code = generateAffiliateCode(() => 0);
    expect(code).toMatch(AFFILIATE_CODE_PATTERN);
    expect(normalizeAffiliateCode(" djiwa-abc12 ")).toBe("DJIWA-ABC12");
    expect(normalizeAffiliateCode("a b")).toBeNull();
    expect(normalizeAffiliateCode(42)).toBeNull();
    expect(validateCustomCode("budi2026")).toBe("BUDI2026");
    expect(() => validateCustomCode("ab")).toThrow();
    expect(() => validateCustomCode("ADMIN")).toThrow();
    expect(() => validateCustomCode("bad-code")).toThrow();
    expect(affiliateLink("https://x.test/", "A B")).toBe("https://x.test/?ref=A%20B");
  });

  it("validates bank details and masks identities", () => {
    expect(
      parseBankDestination({
        bankName: "BCA",
        accountName: "Budi S",
        accountNumber: "123 456 7890",
      }).accountNumber,
    ).toBe("1234567890");
    expect(() =>
      parseBankDestination({ bankName: "BCA", accountName: "Budi", accountNumber: "12ab" }),
    ).toThrow();
    expect(maskAccountNumber("1234567890")).toBe("••••••7890");
    expect(maskedReferee("Rina Aulia")).toBe("Rina A.");
    expect(maskedReferee(null)).toBe("Teman");
  });
});

describe("affiliate end-to-end contract", () => {
  const server = read("src/lib/affiliate.server.ts");
  const migration = read("migrations/033_affiliate.sql");

  it("keeps commissions idempotent per order and one open payout per affiliate", () => {
    expect(migration).toMatch(/order_id uuid not null unique references public\.customer_orders/);
    expect(migration).toContain("affiliate_payouts_one_open_uq");
    expect(migration).toContain("referee_auth_subject text not null unique");
    expect(server).toContain("on conflict (order_id) do nothing");
  });

  it("derives the owner from the verified session, never from browser input", () => {
    const customerInputs = /z\.object\(\{[^}]*(subject|auth_subject|referee|owner)/i;
    expect(server).not.toMatch(customerInputs);
    expect(server).toContain("currentUser()");
  });

  it("guards every admin action and audits it in the same transaction", () => {
    expect(server).toMatch(/mutateAdminAffiliateHandler[\s\S]*await requireAdmin\(\)/);
    expect(server).toMatch(/getAdminAffiliatesHandler\(\) \{\s*await requireAdmin\(\)/);
    expect(server).toContain("recordAdminAction(");
  });

  it("exposes the customer route, admin route, nav entry and sweep task", () => {
    expect(read("src/routes/affiliate.tsx")).toContain('createFileRoute("/affiliate")');
    expect(read("src/routes/admin.affiliates.tsx")).toContain("requireAdmin");
    expect(read("src/components/admin-navigation.ts")).toContain("/admin/affiliates");
    expect(read("src/routes/api.tasks.affiliate-sweep.ts")).toContain("AFFILIATE_TASK_SECRET");
    expect(read("src/routes/__root.tsx")).toContain("AffiliateReferralCapture");
  });
});
