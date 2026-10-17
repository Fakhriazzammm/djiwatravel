import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("provisioning lease boundary", () => {
  it("uses an atomic database claim before the provider call", () => {
    const source = readFileSync(`${process.cwd()}/src/lib/mayar-provisioning.server.ts`, "utf8");
    expect(source).toContain("lease_expires_at = now() + interval '5 minutes'");
    expect(source).toContain("and (status <> 'PROVISIONING' or lease_expires_at is null or lease_expires_at < now())");
    expect(source).toContain("where order_id = ${orderId}::uuid and lease_owner = ${leaseOwner}");
  });
});
