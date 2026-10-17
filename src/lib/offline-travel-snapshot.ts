import type { Order, OrderStatus } from "./orders";
import { effectiveOrderStatus } from "./esim-status";
import { maskSensitive } from "./sensitive-data";

/**
 * Offline snapshot for the eSIM QR and the receipt.
 *
 * Why it exists: a customer who already passed the airport gate has no data connection,
 * and the QR/receipt lived only behind a network read. The snapshot is written only after
 * an authorized read succeeded, is scoped per order, is labelled with the time it was
 * taken, and is never presented as live state.
 *
 * Sensitivity: the QR payload (`lpa`) and the activation code are the eSIM credentials.
 * They are stored in the same origin-scoped localStorage space that `djiwa.orders` already
 * uses for the full order record, and only for an order the device already holds an access
 * token for. The ICCID is stored masked only.
 */
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_KEY_PREFIX = "djiwa.travel.snapshot.";
/** Snapshots older than this are treated as stale and only shown behind a warning. */
export const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TravelSnapshot = {
  version: number;
  orderId: string;
  savedAt: number;
  status: OrderStatus;
  orderCode: string | null;
  packageName: string;
  destination: string;
  quotaLabel: string;
  durationDays: number | null;
  amount: number;
  method: "qris" | "va";
  /** Present only when the order had reached READY/INSTALLED at snapshot time. */
  qr: { lpa: string; smdp: string; activationCode: string; iccidMasked: string } | null;
};

export function snapshotKey(orderId: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${orderId}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function quotaLabelFor(volumeBytes: number | null | undefined): string {
  if (volumeBytes === null || volumeBytes === undefined) return "Unlimited";
  return `${(volumeBytes / 1_000_000_000).toFixed(1)} GB`;
}

/** Derives the snapshot shape from an authorized order read. */
export function buildTravelSnapshot(order: Order, now = Date.now()): TravelSnapshot {
  const status = effectiveOrderStatus(order.status, order.expiresAt);
  const ready = status === "READY" || status === "INSTALLED";
  const esim = ready ? order.esim : undefined;
  return {
    version: SNAPSHOT_VERSION,
    orderId: order.id,
    savedAt: now,
    status,
    orderCode: order.publicOrderCode ?? null,
    packageName: order.packageName ?? order.packageId,
    destination: order.locationCodes?.join(", ") || "Regional",
    quotaLabel: quotaLabelFor(order.volumeBytes),
    durationDays: order.durationDays ?? null,
    amount: order.amount,
    method: order.method,
    qr: esim
      ? {
          lpa: esim.lpa,
          smdp: esim.smdp,
          activationCode: esim.activationCode,
          iccidMasked: maskSensitive(esim.iccid, 6, 4),
        }
      : null,
  };
}

function isSnapshotShape(value: unknown): value is TravelSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<TravelSnapshot>;
  if (candidate.version !== SNAPSHOT_VERSION) return false;
  if (typeof candidate.orderId !== "string" || candidate.orderId.length === 0) return false;
  if (typeof candidate.savedAt !== "number" || !Number.isFinite(candidate.savedAt)) return false;
  if (typeof candidate.packageName !== "string") return false;
  if (typeof candidate.amount !== "number" || !Number.isFinite(candidate.amount)) return false;
  return true;
}

export function readTravelSnapshot(orderId: string): TravelSnapshot | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(snapshotKey(orderId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshotShape(parsed)) return null;
    return parsed.orderId === orderId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeTravelSnapshot(snapshot: TravelSnapshot): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(snapshotKey(snapshot.orderId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearTravelSnapshot(orderId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(snapshotKey(orderId));
  } catch {
    // ignore
  }
}

/** Removes every travel snapshot on this device (used on sign-out / account switch). */
export function clearAllTravelSnapshots(): void {
  const store = storage();
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && key.startsWith(SNAPSHOT_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    // ignore
  }
}

export function isSnapshotStale(snapshot: TravelSnapshot, now = Date.now()): boolean {
  return now - snapshot.savedAt > SNAPSHOT_TTL_MS;
}

export function snapshotAgeLabel(savedAt: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - savedAt);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "kemarin" : `${days} hari lalu`;
}
