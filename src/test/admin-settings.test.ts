import { describe, expect, it } from "vitest";
import { buildSettingAudit, validateAdminSetting } from "../lib/admin-settings";
describe("admin settings governance", () => {
  it("validates safe operational values", () => { expect(validateAdminSetting("retryPolicy", { maxAttempts: 3 })).toBe(true); expect(validateAdminSetting("checkoutKillSwitch", false)).toBe(true); });
  it("requires actor and reason for changes", () => { expect(() => buildSettingAudit("markup", { percent: 25 }, { percent: 30 }, "admin-1", "margin adjustment")).not.toThrow(); expect(() => buildSettingAudit("markup", { percent: 25 }, { percent: 30 }, "", "")).toThrow(); });
});
