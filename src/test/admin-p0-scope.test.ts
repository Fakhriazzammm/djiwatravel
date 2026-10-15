import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { adminNavigation } from "@/components/admin-navigation";
import { maskEmail, maskWhatsapp, toAdminCustomer } from "@/lib/admin-display";

const read = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

// Routes that must stay as guarded redirects. "catalog" was promoted to a first-class
// workspace (Katalog & Pricing), so it is no longer part of this list.
const legacyRoutes = [
  "analytics",
  "customers",
  "refunds",
  "support",
  "index",
  "overview",
];

describe("simplified admin P0 scope", () => {
  it("keeps only curated destinations and never re-exposes legacy routes", () => {
    // "Keuangan" (the Travel finance book) and "Katalog" (Katalog & Pricing) are deliberate
    // additions on top of the P0 five; what this guards is that no legacy destination creeps
    // back into the sidebar.
    expect(adminNavigation.map(([label]) => label)).toEqual([
      "Dashboard",
      "Orders",
      "Pembayaran",
      "Keuangan",
      "Katalog",
      "Provisioning",
      "Settings",
    ]);
    const visibleHrefs = adminNavigation.map(([, href]) => href);
    for (const route of legacyRoutes) {
      expect(visibleHrefs).not.toContain(`/admin/${route}`);
    }
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
    expect(source).toContain("guest_order_access");
    expect(source).toContain("toAdminCustomer");
    expect(source).toContain("payment_webhook_events");
    expect(source).toContain("provider_webhook_events");
    expect(source).toContain("null::int as attempt_count");
    expect(source).toContain("null::timestamptz as next_reconcile_at");
  });

  it("describes successful dashboard data as realtime database data", () => {
    const source = read("routes/admin.dashboard.tsx");
    expect(source).toContain("Ringkasan operasional Djiwa Travel");
    expect(source).not.toContain("Read model operasional belum tersedia");
  });

  it("masks customer contacts and never returns raw values", () => {
    const customer = toAdminCustomer("person@example.com", "+6281234567890");
    expect(maskEmail("person@example.com")).not.toContain("person");
    expect(maskWhatsapp("+6281234567890")).not.toContain("081234567890");
    expect(customer).toEqual({
      label: "Customer — email masked",
      email: "p•••••@example.com",
      whatsapp: "•••••••••7890",
    });
    expect(toAdminCustomer(null, null).label).toBe("Nama belum tersedia");
  });

  it("keeps admin read models timestamped and free of sensitive provider payloads", () => {
    const source = read("lib/admin-read-model.server.ts");
    expect(source).toContain("exceptionAt");
    expect(source).toContain("createdAt");
    expect(source).toContain("updatedAt");
    expect(source).not.toContain("provider_payload");
    expect(source).not.toContain("qr_payload_encrypted");
    expect(source).not.toContain("activation_code_encrypted");
  });

  it("does not put server-only database/provider modules in admin route source", () => {
    for (const route of ["dashboard", "orders", "payments", "provisioning"]) {
      const source = read(`routes/admin.${route}.tsx`);
      expect(source).not.toContain("db/client.server");
      expect(source).not.toContain("esimaccess.com");
      expect(source).not.toContain("payment_intents");
    }
  });

  it("uses the shared Better Auth Google flow for the admin entry", () => {
    const source = read("routes/admin.login.tsx");
    expect(source).toContain("signInGoogle(`${window.location.origin}/admin/dashboard`)");
    expect(source).toContain("Lanjutkan dengan Google");
    expect(source).not.toMatch(/password|pin/i);
  });
});
