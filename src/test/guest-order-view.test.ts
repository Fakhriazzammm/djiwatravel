import { describe, expect, it } from "vitest";
import { mapGuestOrderRecord } from "../lib/guest-order-view";

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
});
