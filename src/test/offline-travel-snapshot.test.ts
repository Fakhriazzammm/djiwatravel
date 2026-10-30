import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTravelSnapshot,
  clearAllTravelSnapshots,
  clearTravelSnapshot,
  isSnapshotStale,
  readTravelSnapshot,
  SNAPSHOT_KEY_PREFIX,
  SNAPSHOT_TTL_MS,
  SNAPSHOT_VERSION,
  snapshotAgeLabel,
  snapshotKey,
  writeTravelSnapshot,
} from "../lib/offline-travel-snapshot";
import type { Order } from "../lib/orders";

const ORDER_ID = "cccccccc-3333-4333-8333-cccccccccccc";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    publicOrderCode: "DJW-ABCD1234",
    packageId: "JP-5GB-7D",
    packageName: "Jepang 5GB",
    locationCodes: ["JP"],
    durationDays: 7,
    volumeBytes: 5_000_000_000,
    amount: 125_000,
    method: "qris",
    status: "READY",
    createdAt: Date.parse("2026-08-01T00:00:00Z"),
    esim: {
      lpa: "LPA:1$smdp.example$ACTIVATION-CODE",
      smdp: "smdp.example",
      activationCode: "ACTIVATION-CODE",
      iccid: "89852345678901234567",
    },
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("travel snapshot", () => {
  it("stores the QR and the receipt summary for an authorized read", () => {
    const snapshot = buildTravelSnapshot(order(), 1_000);
    expect(writeTravelSnapshot(snapshot)).toBe(true);

    const read = readTravelSnapshot(ORDER_ID);
    expect(read?.version).toBe(SNAPSHOT_VERSION);
    expect(read?.packageName).toBe("Jepang 5GB");
    expect(read?.quotaLabel).toBe("5.0 GB");
    expect(read?.qr?.lpa).toBe("LPA:1$smdp.example$ACTIVATION-CODE");
    expect(read?.amount).toBe(125_000);
  });

  it("never stores the full ICCID, only a masked reference", () => {
    writeTravelSnapshot(buildTravelSnapshot(order(), 1_000));
    const raw = localStorage.getItem(snapshotKey(ORDER_ID)) ?? "";
    expect(raw).not.toContain("89852345678901234567");
    expect(readTravelSnapshot(ORDER_ID)?.qr?.iccidMasked).toBe("898523" + "•".repeat(10) + "4567");
  });

  it("withholds the QR until the order actually reached READY", () => {
    const pending = order({ status: "WAITING_PAYMENT" });
    delete pending.esim;
    writeTravelSnapshot(buildTravelSnapshot(pending, 1_000));
    const read = readTravelSnapshot(ORDER_ID);
    expect(read?.qr).toBeNull();
    expect(read?.packageName).toBe("Jepang 5GB");
  });

  it("keeps snapshots separated per order", () => {
    writeTravelSnapshot(buildTravelSnapshot(order(), 1_000));
    writeTravelSnapshot(
      buildTravelSnapshot(
        order({ id: "dddddddd-4444-4444-8444-dddddddddddd", packageName: "Korea 3GB" }),
        1_000,
      ),
    );
    expect(readTravelSnapshot(ORDER_ID)?.packageName).toBe("Jepang 5GB");
    expect(readTravelSnapshot("dddddddd-4444-4444-8444-dddddddddddd")?.packageName).toBe(
      "Korea 3GB",
    );
  });

  it("refuses a malformed or version-mismatched payload", () => {
    localStorage.setItem(snapshotKey(ORDER_ID), "{oops");
    expect(readTravelSnapshot(ORDER_ID)).toBeNull();

    localStorage.setItem(
      snapshotKey(ORDER_ID),
      JSON.stringify({
        version: SNAPSHOT_VERSION + 1,
        orderId: ORDER_ID,
        savedAt: 1,
        packageName: "x",
        amount: 1,
      }),
    );
    expect(readTravelSnapshot(ORDER_ID)).toBeNull();

    localStorage.setItem(
      snapshotKey(ORDER_ID),
      JSON.stringify({
        version: SNAPSHOT_VERSION,
        orderId: "other-order",
        savedAt: 1,
        packageName: "x",
        amount: 1,
      }),
    );
    expect(readTravelSnapshot(ORDER_ID)).toBeNull();
  });

  it("marks a snapshot stale after the freshness window", () => {
    const snapshot = buildTravelSnapshot(order(), 1_000);
    expect(isSnapshotStale(snapshot, 1_000 + SNAPSHOT_TTL_MS - 1)).toBe(false);
    expect(isSnapshotStale(snapshot, 1_000 + SNAPSHOT_TTL_MS + 1)).toBe(true);
  });

  it("labels the age in relative words", () => {
    const now = Date.parse("2026-08-10T12:00:00Z");
    expect(snapshotAgeLabel(now, now)).toBe("baru saja");
    expect(snapshotAgeLabel(now - 5 * 60_000, now)).toBe("5 menit lalu");
    expect(snapshotAgeLabel(now - 3 * 3_600_000, now)).toBe("3 jam lalu");
  });

  it("clears one snapshot and every snapshot on sign-out", () => {
    writeTravelSnapshot(buildTravelSnapshot(order(), 1_000));
    const other = buildTravelSnapshot(order({ id: "dddddddd-4444-4444-8444-dddddddddddd" }), 1_000);
    writeTravelSnapshot(other);

    clearTravelSnapshot(ORDER_ID);
    expect(readTravelSnapshot(ORDER_ID)).toBeNull();
    expect(readTravelSnapshot(other.orderId)).not.toBeNull();

    clearAllTravelSnapshots();
    expect(readTravelSnapshot(other.orderId)).toBeNull();
    expect(localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${other.orderId}`)).toBeNull();
  });

  it("does not throw when storage rejects the write", () => {
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(writeTravelSnapshot(buildTravelSnapshot(order(), 1_000))).toBe(false);
    spy.mockRestore();
  });
});
