import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PWA_CONFIG, normalizePwaConfig, parsePwaConfig } from "../lib/pwa-config";
import {
  detectPlatform,
  installMode,
  isCacheableAssetPath,
  isIosSafari,
  snoozeUntil,
} from "../lib/pwa-install";
import { validateAdminSetting } from "../lib/admin-settings";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36";

const base = {
  config: { installPromptEnabled: true },
  platform: "android" as const,
  standalone: false,
  canPrompt: true,
  iosGuideAvailable: false,
  snoozedUntil: null,
};

describe("pwa platform detection", () => {
  it("tells platforms apart", () => {
    expect(detectPlatform(IPHONE_SAFARI)).toBe("ios");
    expect(detectPlatform(ANDROID)).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0)).toBe("desktop");
  });
  it("only Safari can install on iOS", () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
  });
});

describe("install card policy", () => {
  it("offers the native prompt when the browser allows it", () => {
    expect(installMode(base)).toBe("prompt");
  });
  it("offers the iOS guide on Safari only", () => {
    expect(
      installMode({ ...base, platform: "ios", canPrompt: false, iosGuideAvailable: true }),
    ).toBe("ios-guide");
    expect(installMode({ ...base, platform: "ios", canPrompt: false })).toBeNull();
  });
  it("stays hidden when installed, disabled by Admin, or snoozed", () => {
    expect(installMode({ ...base, standalone: true })).toBeNull();
    expect(installMode({ ...base, config: { installPromptEnabled: false } })).toBeNull();
    const now = 1_000;
    expect(installMode({ ...base, now, snoozedUntil: snoozeUntil(14, now) })).toBeNull();
    expect(
      installMode({ ...base, now: snoozeUntil(14, now) + 1, snoozedUntil: snoozeUntil(14, now) }),
    ).toBe("prompt");
  });
  it("shows nothing without any way to install", () => {
    expect(installMode({ ...base, canPrompt: false })).toBeNull();
  });
});

describe("service worker cache policy", () => {
  it("caches only content-hashed build assets", () => {
    expect(isCacheableAssetPath("/assets/index-Ab12Cd34.js")).toBe(true);
    expect(isCacheableAssetPath("/assets/styles-Zz9_-x12.css")).toBe(true);
    for (const path of [
      "/api/customer-notifications",
      "/api/auth/session",
      "/checkout/abc",
      "/wallet",
      "/assets/home-hero/mascot-v6.png",
      "/assets/esim/pass.webp",
      "/",
    ]) {
      expect(isCacheableAssetPath(path)).toBe(false);
    }
  });
  it("sw.js uses the same hashed-asset rule and never touches the API", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain(
      "HASHED_ASSET = /^\\/assets\\/[^/]+-[A-Za-z0-9_-]{8,}\\.(?:js|css|woff2?)$/",
    );
    expect(sw).not.toMatch(/\/api\//);
    expect(sw).toContain('request.method !== "GET"');
    expect(sw).toContain("SKIP_WAITING");
  });
  it("push click only navigates to same-origin paths", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain('raw.startsWith("/") && !raw.startsWith("//")');
  });
});

describe("pwa admin config", () => {
  it("defaults keep the app installable", () => {
    expect(DEFAULT_PWA_CONFIG.installPromptEnabled).toBe(true);
    expect(parsePwaConfig({})).toEqual(DEFAULT_PWA_CONFIG);
  });
  it("rejects invalid values and falls back on read", () => {
    expect(() => parsePwaConfig({ snoozeDays: 0 })).toThrow();
    expect(() => parsePwaConfig({ snoozeDays: 91 })).toThrow();
    expect(() => parsePwaConfig({ pushEnabled: "yes" })).toThrow();
    expect(() => parsePwaConfig({ promptTitle: "  " })).toThrow();
    expect(() => parsePwaConfig({ promptTitle: "x".repeat(61) })).toThrow();
    expect(normalizePwaConfig("garbage")).toEqual(DEFAULT_PWA_CONFIG);
  });
  it("is a valid audited admin setting", () => {
    expect(validateAdminSetting("pwa", DEFAULT_PWA_CONFIG)).toBe(true);
    expect(() => validateAdminSetting("pwa", { snoozeDays: 0 })).toThrow();
  });
});

describe("manifest", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  it("is installable", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(
      true,
    );
  });
  it("ships screenshots that exist on disk", () => {
    for (const shot of manifest.screenshots) {
      expect(() => readFileSync(`public${shot.src}`)).not.toThrow();
    }
  });
});
