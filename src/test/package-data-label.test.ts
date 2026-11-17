import { describe, expect, it } from "vitest";
import {
  BYTES_PER_GB,
  BYTES_PER_MB,
  UNLIMITED_VOLUME_BYTES,
  isUnlimitedVolume,
} from "@/lib/data-allowance";
import { packageDataLabel, packageDisplayedGb, packageIsUnlimited } from "@/lib/package-copy";
import { normalizeEsimAccessPackage } from "@/lib/esim-access-catalog";
import { formatGb } from "@/lib/travel-journey";
import { quotaLabelFor } from "@/lib/offline-travel-snapshot";

const providerPackage = (patch: Record<string, unknown> = {}) => ({
  packageCode: "JP-UNL-7",
  locationCode: "JP",
  price: 121000,
  duration: 7,
  volume: UNLIMITED_VOLUME_BYTES,
  name: "Japan No-Throttling-Unlimited 7Days (KDDI)",
  ...patch,
});

describe("data allowance labels", () => {
  it("reads provider volumes as GiB, not decimal GB", () => {
    expect(packageDisplayedGb(30 * BYTES_PER_GB)).toBe(30);
    expect(packageDisplayedGb(10 * BYTES_PER_GB)).toBe(10);
    expect(packageDisplayedGb(20 * BYTES_PER_GB)).toBe(20);
    expect(packageDisplayedGb(500 * BYTES_PER_MB)).toBeLessThan(1);
    expect(packageDataLabel({ name: "Japan 30GB 10Days", volumeBytes: 30 * BYTES_PER_GB })).toBe(
      "30 GB data",
    );
    expect(packageDataLabel({ name: "Japan 500MB/Day", volumeBytes: 500 * BYTES_PER_MB })).toBe(
      "500 MB data",
    );
  });

  it("treats the 999 GiB sentinel and the Unlimited name as unmetered", () => {
    const sentinel = { name: "Japan Unlimited-10Mbps 10Days", volumeBytes: UNLIMITED_VOLUME_BYTES };
    expect(isUnlimitedVolume(UNLIMITED_VOLUME_BYTES)).toBe(true);
    expect(isUnlimitedVolume(UNLIMITED_VOLUME_BYTES - BYTES_PER_GB)).toBe(false);
    expect(packageIsUnlimited(sentinel)).toBe(true);
    expect(packageDataLabel(sentinel)).toBe("Data unlimited");
    expect(packageDataLabel({ name: "Japan 30GB", volumeBytes: 1072668082176 })).toBe(
      "Data unlimited",
    );
    expect(formatGb(UNLIMITED_VOLUME_BYTES)).toBe("Unlimited");
    expect(quotaLabelFor(UNLIMITED_VOLUME_BYTES)).toBe("Unlimited");
  });

  it("marks provider packages without the unlimited flag", () => {
    const pkg = normalizeEsimAccessPackage(providerPackage());
    expect(pkg.unlimited).toBe(true);
    expect(packageDataLabel(pkg)).toBe("Data unlimited");

    const metered = normalizeEsimAccessPackage(
      providerPackage({
        packageCode: "JP-30-10",
        name: "Japan 30GB 10Days (KDDI)",
        volume: 30 * BYTES_PER_GB,
      }),
    );
    expect(metered.unlimited).toBeUndefined();
    expect(packageDataLabel(metered)).toBe("30 GB data");
  });

  it("never infers unlimited from a marketing name with an unknown volume", () => {
    const unknown = { name: "Japan Unlimited-10Mbps 7Days", volumeBytes: 0 };
    expect(packageIsUnlimited(unknown)).toBe(false);
    expect(packageDataLabel(unknown)).toBe("Kuota belum tersedia");
  });
});
