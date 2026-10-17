import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("customer refund route contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/routes/refund.$order.tsx"), "utf8");
  it("uses only the customer refund HTTP API", () => {
    expect(source).toContain("/api/customer-refund?order=");
    expect(source).toContain('fetch("/api/customer-refund"');
    expect(source).toContain("JSON.stringify({ order })");
    expect(source).not.toMatch(/\.server/);
  });
  it("renders safe eligibility and fail-closed unavailable state", () => {
    expect(source).toContain("public_order_code");
    expect(source).toContain("provisioning_started");
    expect(source).toContain("provider_refund_workflow_unavailable");
    expect(source).toContain("Fitur refund belum tersedia");
    expect(source).not.toMatch(/amount|provider_reference|customer_auth_subject|email/);
  });
});
