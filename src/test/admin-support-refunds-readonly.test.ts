import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("admin support/refund operational read models", () => {
  it("exposes read-only admin routes", () => {
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
    const mutationPattern =
      /fetch\s*\(|\bPOST\b|\bmutate\b|\binsert\b|\bupdate\s+[a-z_][\w.]*\s+set\b/i;
    expect(support).not.toMatch(mutationPattern);
    expect(refunds).not.toMatch(mutationPattern);
    expect(refunds).toContain("Read-only refund queue");
  });

  it("does not add a provider refund call or financial mutation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/admin-read-model.server.ts"),
      "utf8",
    );
    expect(source).toContain("public.refund_requests");
    expect(source).toContain("public.refund_events");
    expect(source).not.toMatch(/MAYAR_API_KEY|refund.*fetch|fetch.*refund/i);
    expect(source).not.toMatch(
      /insert into public\.refund_requests|update public\.refund_requests/i,
    );
  });
});
