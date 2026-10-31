import { describe, expect, it } from "vitest";
import {
  esimInstallLink,
  installPlatformFromUserAgent,
  isValidLpa,
} from "../lib/esim-install-link";

describe("esim install link", () => {
  const lpa = "LPA:1$smdp.example.com$ABCD-1234-Ef";

  it("builds the lowercase vendor link and keeps the activation code case", () => {
    expect(esimInstallLink(lpa, "ios")).toBe(
      "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA:1$smdp.example.com$ABCD-1234-Ef",
    );
    expect(esimInstallLink(lpa, "android")).toContain("https://esimsetup.android.com/");
  });

  it("refuses anything that is not a plain LPA string", () => {
    for (const bad of [
      "",
      "https://evil.example/x",
      "LPA:1$a b$code",
      "LPA:1$smdp.example.com$code&x=1",
      "LPA:2$smdp.example.com$code",
    ]) {
      expect(isValidLpa(bad)).toBe(false);
      expect(esimInstallLink(bad, "ios")).toBeNull();
    }
  });

  it("detects the platform from the user agent and offers nothing on desktop", () => {
    expect(
      installPlatformFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)"),
    ).toBe("ios");
    expect(installPlatformFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(
      "android",
    );
    expect(
      installPlatformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
    ).toBeNull();
  });
});
