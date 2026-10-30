import { readFileSync } from "node:fs";
import path from "node:path";

describe("customer session server boundary", () => {
  it("keeps the auth helper direct so nested server functions need no RPC manifest entry", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/lib/customer-session.fn.ts"),
      "utf8",
    );

    expect(source).toContain("export async function getAuthenticatedUser");
    expect(source).not.toContain("createServerFn");
  });
});
