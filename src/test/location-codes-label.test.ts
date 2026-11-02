import { describe, expect, it } from "vitest";
import { locationCodesLabel } from "@/lib/package-copy";

describe("locationCodesLabel", () => {
  it("shows full Indonesian names for every covered country", () => {
    expect(locationCodesLabel(["QA", "IL", "IQ", "KW", "SA"])).toBe(
      "Qatar, Israel, Irak, Kuwait, Arab Saudi",
    );
    expect(locationCodesLabel(["JP"])).toBe("Jepang");
  });

  it("normalizes country code casing and ignores empty entries", () => {
    expect(locationCodesLabel([" jp ", "", "kr"])).toBe("Jepang, Korea Selatan");
  });

  it("keeps non-country coverage labels readable", () => {
    expect(locationCodesLabel(["ASIA"])).toBe("ASIA");
    expect(locationCodesLabel([])).toBe("Regional");
    expect(locationCodesLabel(undefined)).toBe("Regional");
  });
});
