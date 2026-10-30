// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("first-paint RPC boundaries", () => {
  it("imports real RPC stubs rather than server-only mocks on home and shared orders", () => {
    const home = readFileSync("src/routes/index.tsx", "utf8");
    const orders = readFileSync("src/lib/orders.ts", "utf8");
    expect(home).toContain("destination-availability.fn");
    expect(orders).toContain("guest-orders.fn");
    expect(orders).toContain("member-orders.fn");
  });
});
