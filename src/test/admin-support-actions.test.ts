import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("admin support actions", () => {
  it("exposes guarded reply and status actions", () => {
    const source = read("src/lib/admin-support.server.ts");
    expect(source).toContain("requireAdmin");
    expect(source).toContain("support_case_messages");
    expect(source).toContain("update support_cases");
    expect(source).toContain("author_type");
    expect(source).toContain("z.discriminatedUnion");
  });

  it("grants only the server app the support action writes", () => {
    const migration = read("migrations/023_admin_support_actions.sql");
    expect(migration).toContain("create table if not exists public.support_cases");
    expect(migration).toContain("create table if not exists public.refund_requests");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE");
    expect(migration).toContain("public.support_cases");
    expect(migration).toContain("public.support_case_messages");
  });
});
