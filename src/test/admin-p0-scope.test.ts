import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { adminNavigation } from "@/components/admin-navigation";

const read = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

const legacyRoutes = ["analytics", "customers", "refunds", "support", "catalog"];

describe("simplified admin P0 scope", () => {
  it("keeps exactly five visible destinations", () => {
    expect(adminNavigation.map(([label]) => label)).toEqual([
      "Dashboard",
      "Orders",
      "Payments",
      "eSIM / Provisioning",
      "Settings",
    ]);
  });

  it("protects and redirects legacy admin routes without preview records", () => {
    for (const route of legacyRoutes) {
      const source = read(`routes/admin.${route}.tsx`);
      expect(source).toContain("requireAdmin");
      expect(source).toContain('to: "/admin/dashboard"');
      expect(source).not.toContain("admin-preview");
      expect(source).not.toMatch(/Fakh|Rin|And|RF-00|SUP-0|Rp 8,42|1\.248/);
    }
  });

  it("exposes an accessible mobile drawer contract", () => {
    const source = read("components/admin-shell.tsx");
    expect(source).toContain('id="admin-mobile-drawer"');
    expect(source).toContain('aria-controls="admin-mobile-drawer"');
    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("min-h-11 min-w-11");
    expect(source).toContain("focus-visible:ring-2");
  });

  it("keeps admin realtime reads on the verified Travel schema", () => {
    const source = read("lib/admin-read-model.server.ts");
    expect(source).not.toContain("payment_intents");
    expect(source).not.toContain("esim_reconciliation_runs");
    expect(source).toContain("payment_webhook_events");
    expect(source).toContain("provider_webhook_events");
    expect(source).toContain("null::int as attempt_count");
    expect(source).toContain("null::timestamptz as next_reconcile_at");
  });

  it("does not put server-only database/provider modules in admin route source", () => {
    for (const route of ["dashboard", "orders", "payments", "provisioning"]) {
      const source = read(`routes/admin.${route}.tsx`);
      expect(source).not.toContain("db/client.server");
      expect(source).not.toContain("esimaccess.com");
      expect(source).not.toContain("payment_intents");
    }
  });
});
