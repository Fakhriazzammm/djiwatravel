import { describe, expect, it } from "vitest";
import { normalizeStoredUsage, selectAuthorizedUsage } from "@/lib/esim-stored-usage";

describe("provider usage snapshot", () => {
  it("accepts provider numbers and preserves the measurement time", () => {
    expect(
      normalizeStoredUsage({
        totalBytes: "5000000000",
        usedBytes: "4500000000",
        remainingBytes: "500000000",
        measuredAt: "2026-10-31T00:00:00Z",
      }),
    ).toEqual({
      totalBytes: 5_000_000_000,
      usedBytes: 4_500_000_000,
      measuredAtMs: Date.parse("2026-10-31T00:00:00Z"),
    });
  });

  it("derives usage only when a valid total and remaining value are supplied", () => {
    expect(
      normalizeStoredUsage({
        totalBytes: "5000000000",
        usedBytes: null,
        remainingBytes: "3000000000",
        measuredAt: null,
      }),
    ).toEqual({ totalBytes: 5_000_000_000, usedBytes: 2_000_000_000 });
    expect(
      normalizeStoredUsage({
        totalBytes: null,
        usedBytes: null,
        remainingBytes: "0",
        measuredAt: null,
      }),
    ).toBeNull();
    expect(
      normalizeStoredUsage({
        totalBytes: "500",
        usedBytes: null,
        remainingBytes: "600",
        measuredAt: null,
      }),
    ).toBeNull();
    expect(
      normalizeStoredUsage({
        totalBytes: "500",
        usedBytes: "-1",
        remainingBytes: null,
        measuredAt: null,
      }),
    ).toBeNull();
  });

  it("never attaches usage for an order outside the authorized set", () => {
    const usage = { totalBytes: 1000, usedBytes: 250 };
    expect(
      selectAuthorizedUsage(
        ["own-order"],
        [
          { providerOrderNo: "other-order", usage },
          { providerOrderNo: "own-order", usage },
        ],
      ),
    ).toEqual(new Map([["own-order", usage]]));
  });
});
