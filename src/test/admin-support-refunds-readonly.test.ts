import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("admin support/refund operational surfaces", () => {
  it("exposes guarded admin routes and safe action boundaries", () => {
    const support = readFileSync(resolve(process.cwd(), "src/routes/admin.support.tsx"), "utf8");
    const refunds = readFileSync(resolve(process.cwd(), "src/routes/admin.refunds.tsx"), "utf8");
    const navigation = readFileSync(
      resolve(process.cwd(), "src/components/admin-navigation.ts"),
      "utf8",
    );
    expect(support).toContain("getAdminSupportCases");
    expect(refunds).toContain("getAdminRefundRequests");
    expect(navigation).toContain("/admin/support");
    expect(navigation).toContain("/admin/refunds");
    expect(support).toContain("mutateAdminSupport");
    expect(refunds).toContain("decideAdminRefund");
    expect(refunds).toContain("Provider belum dipanggil");
  });

  it("does not add a provider refund call", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/admin-read-model.server.ts"),
      "utf8",
    );
    expect(source).toContain("public.refund_requests");
    expect(source).toContain("e.order_id = r.order_id");
    expect(source).not.toContain("e.refund_request_id");
    expect(source).toContain("await requireAdmin()");
    expect(source).not.toMatch(/MAYAR_API_KEY|refund.*fetch|fetch.*refund/i);
  });

  it("grants the server app bounded support/refund access", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "migrations/013_admin_read_model_permissions.sql"),
      "utf8",
    );
    expect(migration).toContain("GRANT SELECT ON TABLE");
    for (const table of [
      "public.support_cases",
      "public.support_case_messages",
      "public.refund_requests",
      "public.refund_events",
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).not.toMatch(/INSERT|UPDATE|DELETE|TRUNCATE/i);
    const actionMigration = readFileSync(
      resolve(process.cwd(), "migrations/023_admin_support_actions.sql"),
      "utf8",
    );
    expect(actionMigration).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE");
  });
});
