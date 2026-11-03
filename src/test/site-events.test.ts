import { describe, expect, it } from "vitest";
import {
  bounceRate,
  deviceFromWidth,
  pagesPerSession,
  sanitizeClickTarget,
  siteEventInput,
} from "@/lib/site-events";

describe("site events", () => {
  it("accepts an anonymous page view and rejects unsafe paths and sessions", () => {
    expect(
      siteEventInput.parse({ name: "page_view", path: "/explore", sessionId: "abcdef12-3456" }),
    ).toMatchObject({ name: "page_view", device: "other" });
    expect(() =>
      siteEventInput.parse({ name: "page_view", path: "/a?email=x@y.z", sessionId: "abcdef12" }),
    ).toThrow();
    expect(() =>
      siteEventInput.parse({ name: "page_view", path: "/", sessionId: "short" }),
    ).toThrow();
    expect(() =>
      siteEventInput.parse({ name: "login", path: "/", sessionId: "abcdef1234" }),
    ).toThrow();
  });

  it("only stores safe click labels", () => {
    expect(sanitizeClickTarget("/destination/japan?x=1")).toBe("/destination/japan");
    expect(sanitizeClickTarget("Cari paket")).toBe("Cari paket");
    expect(sanitizeClickTarget("me@mail.com")).toBeNull();
    expect(sanitizeClickTarget("call 081234567890")).toBeNull();
    expect(sanitizeClickTarget("/a b")).toBeNull();
    expect(sanitizeClickTarget("")).toBeNull();
  });

  it("derives rates without dividing by zero", () => {
    expect(bounceRate(1, 4)).toBe(25);
    expect(bounceRate(0, 0)).toBeNull();
    expect(pagesPerSession(9, 4)).toBe(2.3);
    expect(pagesPerSession(0, 0)).toBeNull();
    expect(deviceFromWidth(390)).toBe("mobile");
    expect(deviceFromWidth(900)).toBe("tablet");
    expect(deviceFromWidth(1440)).toBe("desktop");
  });
});
