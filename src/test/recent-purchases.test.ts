import { describe, expect, it } from "vitest";
import { agoLabel, maskName, packageSizeLabel } from "@/lib/recent-purchases";

describe("recent purchases helpers", () => {
  it("masks everything but the first letter of the first name", () => {
    expect(maskName("Fakhri Azzam")).toBe("F***");
    expect(maskName("  siti ")).toBe("S***");
    expect(maskName(null)).toBe("Traveler");
    expect(maskName("   ")).toBe("Traveler");
  });

  it("formats package size and relative time in Indonesian", () => {
    expect(packageSizeLabel(5 * 1024 ** 3, 30)).toBe("5 GB · 30 Hari");
    expect(packageSizeLabel(null, 7)).toBe("7 Hari");
    expect(agoLabel(0)).toBe("baru saja");
    expect(agoLabel(11)).toBe("11 menit lalu");
    expect(agoLabel(125)).toBe("2 jam lalu");
  });
});
