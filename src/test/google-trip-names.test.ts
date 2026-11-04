import { describe, expect, it } from "vitest";
import { tripGoogleName, tripSheetTitle } from "@/lib/google-trip-names";

describe("Trip names in the traveler's Google files", () => {
  it("adds the departure month so same-named trips stay apart", () => {
    expect(tripGoogleName("Bali", "2026-12-14")).toBe("Bali · Des 2026");
    expect(tripGoogleName("Bali", "2027-01-03")).toBe("Bali · Jan 2027");
    expect(tripGoogleName("Bali", "2026-12-14")).not.toBe(tripGoogleName("Bali", "2027-01-03"));
  });

  it("accepts PostgreSQL Date values and tidies whitespace", () => {
    expect(tripGoogleName("  Bali   Utara ", new Date("2026-05-02T00:00:00.000Z"))).toBe(
      "Bali Utara · Mei 2026",
    );
  });

  it("falls back to the plain name without a usable date", () => {
    expect(tripGoogleName("Bali", null)).toBe("Bali");
    expect(tripGoogleName("Bali", "bukan-tanggal")).toBe("Bali");
    expect(tripGoogleName("   ", "2026-12-14")).toBe("Trip · Des 2026");
  });

  it("builds a bounded spreadsheet title from the label", () => {
    expect(tripSheetTitle("Bali · Des 2026")).toBe("Budget - Bali · Des 2026");
    expect(tripSheetTitle("x".repeat(300)).length).toBe(120);
  });
});
