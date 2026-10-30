import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminNavigation, isAdminNavigationActive } from "@/components/admin-navigation";
const read = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");
describe("admin UI contracts", () => {
  it("keeps canonical navigation unique and nested-route aware", () => {
    const hrefs = adminNavigation.map(([, href]) => href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual([
      "/admin/dashboard",
      "/admin/customers",
      "/admin/analytics",
      "/admin/orders",
      "/admin/payments",
      "/admin/refunds",
      "/admin/support",
      "/admin/finance",
      "/admin/catalog",
      "/admin/provisioning",
      "/admin/audit-log",
      "/admin/team",
      "/admin/settings",
    ]);
    expect(isAdminNavigationActive("/admin/orders/abc", "/admin/orders")).toBe(true);
    expect(isAdminNavigationActive("/admin/settings", "/admin/orders")).toBe(false);
  });
  it("preserves dashboard data contracts and mobile summary markers", () => {
    const source = read("routes/admin.dashboard.tsx");
    for (const marker of [
      "getAdminDashboard",
      "period",
      "data.counts.total",
      "data.counts.paid",
      "data.counts.paymentExceptions",
      "data.counts.provisioningReady",
      "data.counts.paidNotReady",
      "data.counts.grossIdr",
      "data.providerBalance",
      "provider.sellableCeilingUsd",
      "formatAdminDateTime(data.updatedAt)",
    ])
      expect(source).toContain(marker);
    expect(source).toContain("AdminDetailSheet");
  });
  it("keeps live route loaders, privacy, and auth guards", () => {
    for (const [file, loader] of [
      ["admin.orders.tsx", "getAdminOrders"],
      ["admin.payments.tsx", "getAdminPayments"],
      ["admin.provisioning.tsx", "getAdminProvisioning"],
      ["admin.finance.tsx", "getTravelFinanceReport"],
      ["admin.settings.tsx", "getAdminReadiness"],
    ] as const) {
      const source = read(`routes/${file}`);
      expect(source).toContain(loader);
      expect(source).toContain("requireAdmin");
    }
  });
  it("keeps aliases guarded and explicit", () => {
    // "catalog" is a real workspace now, so it is asserted by admin-p0-scope instead.
    for (const name of ["overview"]) {
      const source = read(`routes/admin.${name}.tsx`);
      expect(source).toContain("requireAdmin");
      expect(source).toContain('to: "/admin/dashboard"');
    }
  });
});
