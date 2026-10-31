import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { destinationArt, stateArt } from "../lib/destination-art";

describe("destination art", () => {
  it("ships a file for every mapped destination and state", () => {
    for (const code of ["JP", "kr", "TH", "SG", "SA", "ASIA", "GLOBAL"]) {
      const art = destinationArt(code);
      expect(art.src, code).toBeTruthy();
      expect(existsSync(`public${art.src}`), art.src).toBe(true);
    }
    for (const kind of ["ready", "pending", "low"]) {
      expect(existsSync(`public${stateArt(kind)}`), kind).toBe(true);
    }
    expect(stateArt("active")).toBeUndefined();
  });

  it("falls back to a neutral light tint without art for unknown destinations", () => {
    expect(destinationArt("ZZ").src).toBeUndefined();
    expect(destinationArt(undefined).tint).toContain("#fff");
  });
});
