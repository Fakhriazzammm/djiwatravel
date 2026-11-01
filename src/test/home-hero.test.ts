import { describe, expect, it } from "vitest";
import {
  heroClockLine,
  heroGreeting,
  heroPhaseAt,
  isDarkPhase,
  resolveHeroPhase,
} from "@/lib/home-hero";

const at = (h: number, m = 0) => new Date(2026, 10, 2, h, m);

describe("home hero phases", () => {
  it("follows the device clock across the six phases", () => {
    expect(heroPhaseAt(at(0, 40))).toBe("tengah-malam");
    expect(heroPhaseAt(at(4, 0))).toBe("subuh");
    expect(heroPhaseAt(at(6, 29))).toBe("subuh");
    expect(heroPhaseAt(at(6, 30))).toBe("pagi");
    expect(heroPhaseAt(at(10, 30))).toBe("siang");
    expect(heroPhaseAt(at(15, 0))).toBe("sore");
    expect(heroPhaseAt(at(18, 15))).toBe("malam");
    expect(heroPhaseAt(at(23, 29))).toBe("malam");
    expect(heroPhaseAt(at(23, 30))).toBe("tengah-malam");
  });

  it("lets Admin pin a phase and marks dark skies", () => {
    expect(resolveHeroPhase("siang", at(2))).toBe("siang");
    expect(resolveHeroPhase("auto", at(2))).toBe("tengah-malam");
    expect(isDarkPhase("malam")).toBe(true);
    expect(isDarkPhase("pagi")).toBe(false);
  });

  it("greets with the first name only when signed in, and formats the quiet clock line", () => {
    expect(heroGreeting("pagi", "Fakhri")).toBe("Selamat pagi, Fakhri");
    expect(heroGreeting("pagi", null)).toBe("Selamat pagi");
    expect(heroGreeting("tengah-malam", "Fakhri")).toBe("Masih terjaga, Fakhri");
    expect(heroClockLine(at(9, 5))).toEqual({
      day: "Senin",
      date: "2 November 2026",
      time: "09.05",
    });
  });
});

describe("home hero mascot launch", () => {
  it("flies the mascot out before the search sheet opens and respects reduced motion", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/home-hero.tsx", "utf8");
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("window.setTimeout(onOpenSearch");
    expect(source).toContain("onClick={launch}");
    expect(source).toContain('fly === "idle"');
  });
});
