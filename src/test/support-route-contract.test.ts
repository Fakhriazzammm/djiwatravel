import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("customer support route contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/routes/support.tsx"), "utf8");
  it("uses the customer-support HTTP API and client idempotency", () => {
    expect(source).toContain('fetch("/api/customer-support"');
    expect(source).toContain('action: "create"');
    expect(source).toContain("idempotency_key: crypto.randomUUID()");
    expect(source).toContain('action: "reply"');
  });
  it("does not import server modules or render client identity fields", () => {
    expect(source).not.toMatch(/\.server/);
    expect(source).not.toMatch(/email|customer_auth_subject|user\.name/);
  });
});
