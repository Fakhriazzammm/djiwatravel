import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("admin provisioning actions", () => {
  it("uses the existing idempotent provisioning service behind admin auth", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/admin-provisioning.server.ts"), "utf8");
    expect(source).toContain("requireAdmin");
    expect(source).toContain("provisionSettledTravelOrder");
    expect(source).toContain("z.string().uuid()");
  });

  it("exposes a retry control only for failed queue rows", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/admin.provisioning.tsx"), "utf8");
    expect(source).toContain("retryAdminProvisioning");
    expect(source).toContain('x.status === "FAILED"');
  });
});
