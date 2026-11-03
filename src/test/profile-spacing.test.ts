import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/profile.tsx"), "utf8");

describe("profile page structure", () => {
  it("shows the data grid, a short order list, and a link to every order", () => {
    expect(source).toContain("<ProfileServiceGrid");
    expect(source).toContain("orders.slice(0, 3)");
    expect(source).toContain('to="/my-orders"');
  });

  it("confirms before deleting the saved profile and names what is kept", () => {
    expect(source).toContain("Hapus data profil?");
    expect(source).toContain("Akun dan pesananmu tidak terpengaruh");
  });
});
