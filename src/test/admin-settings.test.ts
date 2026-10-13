import { describe, expect, it } from "vitest";
import { buildSettingAudit, validateAdminSetting } from "../lib/admin-settings";
import { getResellerReadiness } from "../lib/reseller-readiness";
describe("admin settings governance", () => {
  it("validates safe operational values", () => {
    expect(validateAdminSetting("retryPolicy", { maxAttempts: 3 })).toBe(true);
    expect(validateAdminSetting("checkoutKillSwitch", false)).toBe(true);
  });
  it("requires actor and reason for changes", () => {
    expect(() =>
      buildSettingAudit("markup", { percent: 25 }, { percent: 30 }, "admin-1", "margin adjustment"),
    ).not.toThrow();
    expect(() => buildSettingAudit("markup", { percent: 25 }, { percent: 30 }, "", "")).toThrow();
  });
  it("reports allowlist readiness and keeps invites blocked without a canonical contract", () => {
    const items = getResellerReadiness({
      ADMIN_EMAILS: " fakhriazzamm@gmail.com ",
    } as NodeJS.ProcessEnv);
    expect(items.find((item) => item.name === "Admin auth")).toMatchObject({ ready: true });
    expect(items.find((item) => item.name === "Admin invites")).toMatchObject({ ready: false });
    expect(items.find((item) => item.name === "Admin invites")?.detail).not.toMatch(
      /token|secret/i,
    );
  });
});
