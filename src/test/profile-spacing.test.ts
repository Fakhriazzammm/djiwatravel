import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("profile order history spacing", () => {
  it("keeps a gap between the order filters and the order state", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/profile.tsx"), "utf8");

    expect(source).toContain('<div className={`${group} mt-2`}>');
  });
});
