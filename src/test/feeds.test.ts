import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_FEEDS_CONFIG,
  feedAuthorName,
  feedPhotoMime,
  feedRelativeTime,
  findBannedWord,
  inferFeedKind,
  normalizeFeedsConfig,
  parseFeedsConfig,
} from "@/lib/feeds";
import { validateAdminSetting } from "@/lib/admin-settings";
import { adminNavigationGroups } from "@/components/admin-navigation";

describe("feeds config", () => {
  it("ships off with review of the first posts", () => {
    expect(DEFAULT_FEEDS_CONFIG.enabled).toBe(false);
    expect(DEFAULT_FEEDS_CONFIG.reviewFirstPosts).toBeGreaterThan(0);
  });

  it("parses a partial object over the defaults and rejects bad values", () => {
    expect(parseFeedsConfig({ enabled: true }).postsPerDay).toBe(DEFAULT_FEEDS_CONFIG.postsPerDay);
    expect(() => parseFeedsConfig({ enabled: "yes" })).toThrow(/boolean/);
    expect(() => parseFeedsConfig({ postsPerDay: 0 })).toThrow(/postsPerDay/);
    expect(() => parseFeedsConfig({ reviewFirstPosts: 21 })).toThrow(/reviewFirstPosts/);
    expect(() => parseFeedsConfig({ bannedWords: ["a"] })).toThrow(/2-40/);
    expect(() => parseFeedsConfig([])).toThrow();
  });

  it("lowercases and dedupes banned words", () => {
    expect(parseFeedsConfig({ bannedWords: ["Judi", "judi", " Slot  "] }).bannedWords).toEqual([
      "judi",
      "slot",
    ]);
  });

  it("falls back to the defaults (off) for a broken stored value", () => {
    expect(normalizeFeedsConfig({ enabled: 1 })).toEqual(DEFAULT_FEEDS_CONFIG);
  });

  it("is a registered, validated Admin setting", () => {
    expect(validateAdminSetting("feeds", { enabled: true })).toBe(true);
    expect(() => validateAdminSetting("feeds", { enabled: "x" })).toThrow();
  });
});

describe("feeds helpers", () => {
  it("shows only a first name, never an e-mail or a full name", () => {
    expect(feedAuthorName("rani putri")).toBe("Rani");
    expect(feedAuthorName("  ")).toBe("Traveler");
    expect(feedAuthorName(null)).toBe("Traveler");
    expect(feedAuthorName("a@b.c")).toBe("Abc");
  });

  it("guesses the kind from the text", () => {
    expect(inferFeedKind("JR Pass atau satuan?", "")).toBe("tanya");
    expect(inferFeedKind("Datang jam 15.00", "Ichiran")).toBe("tips");
    expect(inferFeedKind("Seru banget", "")).toBe("cerita");
  });

  it("finds banned words as whole words, ignoring case and accents", () => {
    expect(findBannedWord("Main JUDI online", ["judi"])).toBe("judi");
    expect(findBannedWord("Pejudian", ["judi"])).toBeNull();
    expect(findBannedWord("slot  gacor!", ["slot gacor"])).toBe("slot gacor");
    expect(findBannedWord("aman", [])).toBeNull();
  });

  it("formats relative time in Indonesian", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(feedRelativeTime("2026-11-14T11:59:40Z", now)).toBe("Baru saja");
    expect(feedRelativeTime("2026-11-14T11:30:00Z", now)).toBe("30 menit lalu");
    expect(feedRelativeTime("2026-11-14T10:00:00Z", now)).toBe("2 jam lalu");
    expect(feedRelativeTime("2026-11-13T09:00:00Z", now)).toBe("Kemarin");
    expect(feedRelativeTime("2026-11-10T09:00:00Z", now)).toBe("4 hari lalu");
  });

  it("accepts only real JPEG, PNG and WebP bytes within 5 MB", () => {
    const jpeg = new Uint8Array(20).fill(1);
    jpeg.set([255, 216, 255]);
    expect(feedPhotoMime(jpeg)).toBe("image/jpeg");
    const png = new Uint8Array(20);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(feedPhotoMime(png)).toBe("image/png");
    const webp = new Uint8Array(20);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBP"), 8);
    expect(feedPhotoMime(webp)).toBe("image/webp");
    expect(feedPhotoMime(new Uint8Array(20).fill(7))).toBeNull();
    expect(feedPhotoMime(new Uint8Array(5 * 1024 * 1024 + 1))).toBeNull();
  });
});

describe("feeds surfaces", () => {
  it("has an Admin entry in the navigation", () => {
    const group = adminNavigationGroups.find((g) => g.label === "Feeds");
    expect(group?.items.map((i) => i[1])).toContain("/admin/feeds");
  });

  it("keeps the customer entry points tied to the Admin switch", () => {
    const explore = readFileSync(resolve(process.cwd(), "src/routes/explore.tsx"), "utf8");
    expect(explore).toContain("useFeedsStatus");
    expect(explore).toContain("feeds.enabled");
    const server = readFileSync(resolve(process.cwd(), "src/lib/feeds.server.ts"), "utf8");
    // Ownership comes from the verified session, never from the browser.
    expect(server).not.toMatch(/data\.subject|input\.data\.customer/);
  });

  it("uses Explore routes for activity and personal feeds while redirecting old paths", () => {
    const activity = readFileSync(
      resolve(process.cwd(), "src/routes/explore.aktivitas.tsx"),
      "utf8",
    );
    const me = readFileSync(resolve(process.cwd(), "src/routes/explore.aku.tsx"), "utf8");
    const oldActivity = readFileSync(
      resolve(process.cwd(), "src/routes/feeds.aktivitas.tsx"),
      "utf8",
    );
    const oldMe = readFileSync(resolve(process.cwd(), "src/routes/feeds.aku.tsx"), "utf8");
    expect(activity).toContain('createFileRoute("/explore/aktivitas")');
    expect(me).toContain('createFileRoute("/explore/aku")');
    expect(oldActivity).toContain('redirect({ to: "/explore/aktivitas", replace: true })');
    expect(oldMe).toContain('redirect({ to: "/explore/aku", replace: true })');
  });
});
