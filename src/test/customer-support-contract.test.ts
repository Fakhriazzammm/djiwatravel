import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
describe("customer support wave 4a contract", () => {
  it("keeps the migration additive, rerunnable, and browser-policy free", () => {
    const sql = readFileSync(resolve(root, "migrations/011_customer_support_wave4.sql"), "utf8");
    expect(sql).toMatch(/add column if not exists customer_auth_subject/i);
    expect(sql).toMatch(/create table if not exists support_case_messages/i);
    expect(sql).toMatch(/where customer_auth_subject is not null/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("derives ownership from Better Auth and fails closed for order binding", () => {
    const source = readFileSync(resolve(root, "src/lib/customer-support.server.ts"), "utf8");
    expect(source).toContain("requireBetterAuthUser");
    expect(source).toContain("user.id");
    expect(source).toContain("Order binding is unavailable");
    expect(source).toContain("fingerprint mismatch");
  });
});
