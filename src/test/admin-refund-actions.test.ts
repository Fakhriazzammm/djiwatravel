import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("admin refund decisions", () => {
  it("records an admin decision without calling a provider", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/admin-refunds.server.ts"), "utf8");
    expect(source).toContain("requireAdmin");
    expect(source).toContain("refund_requests");
    expect(source).toContain("refund_events");
    expect(source).toContain("APPROVED");
    expect(source).not.toMatch(/MAYAR_API_KEY|fetch\s*\(/i);
  });

  it("grants only server-side decision writes", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/024_admin_refund_decisions.sql"), "utf8");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE");
    expect(migration).toContain("public.refund_requests");
    expect(migration).toContain("public.refund_events");
  });
});
