import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeAdminOrdersQuery } from "@/lib/admin-read-model.server";

const read = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

describe("admin action audit trail", () => {
  it("records every admin mutation with an actor", () => {
    for (const [file, action] of [
      ["lib/admin-refunds.server.ts", "refund."],
      ["lib/admin-support.server.ts", "support."],
      ["lib/admin-provisioning.server.ts", "provisioning.retry"],
      ["lib/admin-finance.server.ts", "finance.expense"],
    ] as const) {
      const source = read(file);
      expect(source).toContain("recordAdminAction");
      expect(source).toContain(action);
      expect(source).toContain("actor");
    }
  });

  it("writes refund and support audit rows inside the same transaction", () => {
    for (const file of ["lib/admin-refunds.server.ts", "lib/admin-support.server.ts"]) {
      const source = read(file);
      expect(source).toMatch(/recordAdminAction\([\s\S]*?client,\s*\);\s*await client\.query\("commit"\)/);
    }
  });

  it("shows admin actions in the audit log and keeps payment events as a second tab", () => {
    const source = read("routes/admin.audit-log.tsx");
    expect(source).toContain("getAdminActions");
    expect(source).toContain("Aksi admin");
    expect(source).toContain("Event pembayaran");
  });

  it("sends the real refund request id to the decision action", () => {
    expect(read("lib/admin-read-model.server.ts")).not.toContain('id: maskReference(text(row, "id"))');
  });
});

describe("admin orders query", () => {
  it("normalizes search, status and page", () => {
    expect(normalizeAdminOrdersQuery()).toEqual({ q: "", status: "ALL", page: 0 });
    expect(normalizeAdminOrdersQuery({ q: "  ABC  ", status: "READY", page: 3 })).toEqual({
      q: "ABC",
      status: "READY",
      page: 3,
    });
    expect(normalizeAdminOrdersQuery({ status: "DROP TABLE", page: -5 })).toMatchObject({
      status: "ALL",
      page: 0,
    });
    expect(normalizeAdminOrdersQuery({ q: "x".repeat(200) }).q).toHaveLength(80);
  });

  it("filters in SQL with a bounded page instead of fetching everything", () => {
    const source = read("lib/admin-read-model.server.ts");
    expect(source).toContain("ADMIN_ORDERS_PAGE_SIZE");
    expect(source).toContain("offset ${query.page * ADMIN_ORDERS_PAGE_SIZE}");
  });
});

describe("admin ops simplifications", () => {
  it("lets admins confirm refund decisions without window.prompt and refreshes after actions", () => {
    const refunds = read("routes/admin.refunds.tsx");
    expect(refunds).not.toContain("window.prompt");
    expect(refunds).toContain("router.invalidate()");
    expect(read("routes/admin.support.tsx")).toContain("router.invalidate()");
  });

  it("offers provisioning retry from the order detail", () => {
    expect(read("routes/admin.orders.$id.tsx")).toContain("retryAdminProvisioning");
  });

  it("drops the placeholder readiness stat and the duplicate payment id column", () => {
    expect(read("routes/admin.settings.tsx")).not.toContain("Last check");
    expect(read("routes/admin.payments.tsx")).not.toContain("Payment ID");
  });
});
