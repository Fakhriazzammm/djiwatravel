import { describe, expect, it } from "vitest";
import { mapGuestOrderRecord } from "../lib/guest-order-view";
import { buildEsimHomeSummary } from "../lib/esim-home-summary";

describe("mapGuestOrderRecord", () => {
  it("maps a persisted guest order and its live package snapshot for frontend pages", () => {
    expect(
      mapGuestOrderRecord({
        id: "0d9b9977-8f58-4d41-8c44-72144b742b46",
        publicOrderCode: "ABCD1234",
        status: "ORDER_CREATED",
        amount: 42000,
        createdAtMs: 1800000000000,
        expiresAtMs: 1800001800000,
        packageCode: "TH-7D-2GB",
        paymentMethod: "qris",
        packageSnapshot: {
          name: "Thailand 7 days",
          locationCodes: ["TH"],
          durationDays: 7,
          volumeBytes: 2147483648,
          supportsTopUp: false,
        },
      }),
    ).toMatchObject({
      id: "0d9b9977-8f58-4d41-8c44-72144b742b46",
      packageId: "TH-7D-2GB",
      packageName: "Thailand 7 days",
      locationCodes: ["TH"],
      durationDays: 7,
      volumeBytes: 2147483648,
      amount: 42000,
      method: "qris",
      status: "ORDER_CREATED",
      createdAt: 1800000000000,
      expiresAt: 1800001800000,
    });
  });

  it("maps a provider usage snapshot and an in-use profile into a customer's active eSIM", () => {
    const view = mapGuestOrderRecord({
      id: "order-1",
      publicOrderCode: "ORDER1",
      status: "READY",
      profileStatus: "IN_USE",
      amount: 42000,
      createdAtMs: 1800000000000,
      packageCode: "JP-5GB",
      paymentMethod: "qris",
      packageSnapshot: {
        name: "Japan",
        locationCodes: ["JP"],
        durationDays: 7,
        volumeBytes: 5_000_000_000,
        supportsTopUp: false,
      },
      usage: { totalBytes: 5_000_000_000, usedBytes: 4_500_000_000, measuredAtMs: 1800000001000 },
    });
    expect(view).toMatchObject({
      status: "INSTALLED",
      usedGb: 4.5,
      usageVolumeBytes: 5_000_000_000,
      usageMeasuredAt: 1800000001000,
    });
    const card = buildEsimHomeSummary([view], 1800000002000);
    expect(card.kind).toBe("low");
    expect(card.quotaValue).toBe("0.5 GB");
    expect(card.remainingPercent).toBe(10);
    expect(card.measuredAt).toBe(1800000001000);
  });

  it("does not turn a ready eSIM into an active one without an in-use profile", () => {
    const view = mapGuestOrderRecord({
      id: "order-2",
      publicOrderCode: "ORDER2",
      status: "READY",
      profileStatus: "RELEASED",
      amount: 42000,
      createdAtMs: 1800000000000,
      packageCode: "JP",
      paymentMethod: "qris",
      packageSnapshot: {
        name: "Japan",
        locationCodes: ["JP"],
        durationDays: 7,
        volumeBytes: 5_000_000_000,
        supportsTopUp: false,
      },
    });
    expect(view.status).toBe("READY");
    expect(view.usedGb).toBeUndefined();
  });
});
