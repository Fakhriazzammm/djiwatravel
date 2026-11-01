import { describe, expect, it } from "vitest";
import { digitsOnly, formatRupiahDigits } from "@/components/money-input";

describe("rupiah input formatting", () => {
  it("groups thousands with dots and keeps only digits", () => {
    expect(formatRupiahDigits("1000000")).toBe("1.000.000");
    expect(formatRupiahDigits("15000")).toBe("15.000");
    expect(formatRupiahDigits("0007")).toBe("7");
    expect(formatRupiahDigits("")).toBe("");
    expect(digitsOnly("Rp 1.250.000,-")).toBe("1250000");
  });
});
