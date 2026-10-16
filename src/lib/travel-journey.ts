import type { OrderStatus } from "./orders";

/* ------------------------------------------------------------------ *
 * Activation timeline
 *
 * The customer-facing answer to "where is my eSIM?". Every order status
 * maps to one explicit plan so no status can silently fall through to a
 * success-looking screen.
 * ------------------------------------------------------------------ */

export type ActivationStageId = "payment" | "processing" | "ready" | "active";
export type ActivationStageState = "done" | "current" | "todo" | "failed";
export type ActivationState =
  | "in_progress"
  | "ready"
  | "active"
  | "expired"
  | "failed"
  | "cancelled"
  | "refunded";

export type ActivationStage = {
  id: ActivationStageId;
  label: string;
  state: ActivationStageState;
};

export type ActivationTimeline = {
  state: ActivationState;
  headline: string;
  hint: string;
  /** True while a provider read-back can still change this state. */
  canRefresh: boolean;
  stages: ActivationStage[];
};

const STAGE_ORDER: ActivationStageId[] = ["payment", "processing", "ready", "active"];

const STAGE_LABEL: Record<ActivationStageId, string> = {
  payment: "Pembayaran",
  processing: "Diproses",
  ready: "Siap dipasang",
  active: "Aktif",
};

type ActivationPlan = {
  state: ActivationState;
  /** Number of stages already completed. */
  done: number;
  /** Stage index currently running, or null when nothing is running. */
  current: number | null;
  /** Stage index that failed, or null. */
  failed: number | null;
  headline: string;
  hint: string;
  canRefresh: boolean;
};

const PLANS: Record<OrderStatus, ActivationPlan> = {
  ORDER_CREATED: {
    state: "in_progress",
    done: 0,
    current: 0,
    failed: null,
    headline: "Menunggu pembayaran",
    hint: "Selesaikan pembayaran dulu, eSIM mulai diproses setelah itu.",
    canRefresh: true,
  },
  WAITING_PAYMENT: {
    state: "in_progress",
    done: 0,
    current: 0,
    failed: null,
    headline: "Menunggu pembayaran",
    hint: "Selesaikan pembayaran dulu, eSIM mulai diproses setelah itu.",
    canRefresh: true,
  },
  PAID: {
    state: "in_progress",
    done: 1,
    current: 1,
    failed: null,
    headline: "Pembayaran diterima",
    hint: "Penyedia sedang menyiapkan eSIM kamu. Biasanya selesai dalam beberapa menit.",
    canRefresh: true,
  },
  PROVISIONING: {
    state: "in_progress",
    done: 1,
    current: 1,
    failed: null,
    headline: "eSIM sedang diproses",
    hint: "Penyedia sedang menyiapkan eSIM kamu. Biasanya selesai dalam beberapa menit.",
    canRefresh: true,
  },
  READY: {
    state: "ready",
    done: 2,
    current: 2,
    failed: null,
    headline: "Siap dipasang",
    hint: "Pasang eSIM sebelum berangkat. Butuh Wi-Fi, cukup sekali.",
    canRefresh: true,
  },
  INSTALLED: {
    state: "active",
    done: 4,
    current: null,
    failed: null,
    headline: "eSIM terpasang",
    hint: "Nyalakan Data Roaming untuk eSIM ini saat sudah sampai di tujuan.",
    canRefresh: true,
  },
  EXPIRED: {
    state: "expired",
    done: 4,
    current: null,
    failed: null,
    headline: "Masa aktif berakhir",
    hint: "Paket ini sudah habis masa aktifnya. Beli paket baru untuk perjalanan berikutnya.",
    canRefresh: false,
  },
  PROVISIONING_FAILED: {
    state: "failed",
    done: 1,
    current: null,
    failed: 1,
    headline: "Pemrosesan belum berhasil",
    hint: "Kami bisa mencoba memproses ulang pesanan yang sama tanpa membuat order baru.",
    canRefresh: true,
  },
  CANCELLED: {
    state: "cancelled",
    done: 0,
    current: null,
    failed: null,
    headline: "Pesanan dibatalkan",
    hint: "Pesanan ini tidak dilanjutkan. Kamu bisa memilih paket lain kapan saja.",
    canRefresh: false,
  },
  REFUNDED: {
    state: "refunded",
    done: 0,
    current: null,
    failed: null,
    headline: "Dana dikembalikan",
    hint: "Pengembalian dana sedang atau sudah diproses sesuai kebijakan kami.",
    canRefresh: false,
  },
};

export function activationTimeline(status: OrderStatus): ActivationTimeline {
  const plan = PLANS[status] ?? PLANS.ORDER_CREATED;
  const stages: ActivationStage[] = STAGE_ORDER.map((id, index) => {
    const state: ActivationStageState =
      plan.failed === index
        ? "failed"
        : index < plan.done
          ? "done"
          : plan.current === index
            ? "current"
            : "todo";
    return { id, label: STAGE_LABEL[id], state };
  });
  return {
    state: plan.state,
    headline: plan.headline,
    hint: plan.hint,
    canRefresh: plan.canRefresh,
    stages,
  };
}

/* ------------------------------------------------------------------ *
 * Usage / quota
 *
 * A provider read that fails must never be rendered as "0 MB used".
 * When the number is unknown the view says so instead of guessing.
 * ------------------------------------------------------------------ */

export type UsageKind = "unavailable" | "unlimited" | "measured";

export type UsageView = {
  kind: UsageKind;
  note: string;
  totalBytes: number | null;
  usedBytes: number | null;
  remainingBytes: number | null;
  remainingPercent: number | null;
  low: boolean;
  measuredAt: number | null;
};

export const LOW_QUOTA_PERCENT = 20;

const BYTES_PER_GB = 1_000_000_000;

export function formatGb(bytes: number): string {
  return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function usageView(input: {
  volumeBytes?: number | null;
  usedGb?: number | null;
  measuredAt?: number | null;
  active: boolean;
}): UsageView {
  const total = finiteNumber(input.volumeBytes);
  const usedGb = finiteNumber(input.usedGb);
  const measuredAt = finiteNumber(input.measuredAt);
  const usedBytes = usedGb === null || usedGb < 0 ? null : usedGb * BYTES_PER_GB;
  const empty: Omit<UsageView, "kind" | "note"> = {
    totalBytes: total !== null && total > 0 ? total : null,
    usedBytes,
    remainingBytes: null,
    remainingPercent: null,
    low: false,
    measuredAt,
  };

  if (!input.active) {
    return { ...empty, kind: "unavailable", note: "Data pemakaian muncul setelah eSIM aktif." };
  }

  const knownTotal = total !== null && total > 0 ? total : null;

  if (knownTotal === null && usedBytes === null) {
    return {
      ...empty,
      kind: "unavailable",
      note: "Penyedia belum mengirim data pemakaian untuk eSIM ini.",
    };
  }

  if (knownTotal === null) {
    return {
      ...empty,
      kind: "unlimited",
      note: "Paket ini tidak dibatasi kuota tetap.",
      usedBytes,
    };
  }

  if (usedBytes === null) {
    return {
      ...empty,
      kind: "unavailable",
      note: `Total kuota ${formatGb(knownTotal)}. Pemakaian belum dilaporkan penyedia.`,
    };
  }

  const remainingBytes = Math.max(0, knownTotal - usedBytes);
  const remainingPercent = Math.round((remainingBytes / knownTotal) * 100);
  return {
    ...empty,
    kind: "measured",
    note: "",
    totalBytes: knownTotal,
    usedBytes,
    remainingBytes,
    remainingPercent,
    low: remainingPercent <= LOW_QUOTA_PERCENT,
    measuredAt,
  };
}

/* ------------------------------------------------------------------ *
 * Travel checklist keyed to the departure date
 * ------------------------------------------------------------------ */

export type ChecklistKey = "device" | "install" | "save-qr" | "data-roaming" | "arrival-test";
export type ChecklistState = "done" | "due" | "upcoming" | "no-date";

export type ChecklistItem = {
  key: ChecklistKey;
  label: string;
  hint: string;
  milestone: string | null;
  dueAt: number | null;
  state: ChecklistState;
};

type ChecklistDefinition = {
  key: ChecklistKey;
  label: string;
  hint: string;
  /** Days relative to the departure date; negative means before departure. */
  offsetDays: number;
};

const CHECKLIST: ChecklistDefinition[] = [
  {
    key: "device",
    label: "Cek kompatibilitas perangkat",
    hint: "Pastikan ponsel mendukung eSIM dan tidak terkunci operator.",
    offsetDays: -7,
  },
  {
    key: "install",
    label: "Pasang eSIM",
    hint: "Butuh Wi-Fi. Lakukan sebelum berangkat, cukup sekali.",
    offsetDays: -1,
  },
  {
    key: "save-qr",
    label: "Simpan QR dan kode aktivasi",
    hint: "Simpan tangkapan layar supaya tetap bisa dipasang tanpa internet.",
    offsetDays: -1,
  },
  {
    key: "data-roaming",
    label: "Nyalakan Data Roaming untuk eSIM Djiwa",
    hint: "Cukup untuk line eSIM ini, bukan line utama kamu.",
    offsetDays: 0,
  },
  {
    key: "arrival-test",
    label: "Tes koneksi saat tiba di tujuan",
    hint: "Kalau belum jalan, cek panduan pasang eSIM di halaman ini.",
    offsetDays: 0,
  },
];

export const CHECKLIST_KEYS: ChecklistKey[] = CHECKLIST.map((entry) => entry.key);

/** Parses a `YYYY-MM-DD` value into a local-midnight timestamp, or null. */
export function parseDepartureDate(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const timestamp = new Date(year, month - 1, day).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const parsed = new Date(timestamp);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }
  return timestamp;
}

export function toDepartureDateValue(timestamp: number): string {
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

/** Whole local calendar days from today until the departure date. */
export function calendarDaysUntil(targetAt: number, now = Date.now()): number {
  const today = new Date(now);
  const target = new Date(targetAt);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

export function departureLabel(daysUntil: number): string {
  if (daysUntil === 0) return "Hari keberangkatan";
  if (daysUntil === 1) return "Besok berangkat";
  if (daysUntil > 1) return `H-${daysUntil}`;
  const elapsed = Math.abs(daysUntil);
  return elapsed === 1 ? "Sudah berangkat kemarin" : `Sudah berangkat ${elapsed} hari lalu`;
}

export function milestoneLabel(offsetDays: number): string {
  if (offsetDays === 0) return "Hari H";
  return offsetDays < 0 ? `H${offsetDays}` : `H+${offsetDays}`;
}

export function buildTravelChecklist(input: {
  departureDate?: string | null;
  completed?: Record<string, number> | null;
  now?: number;
}): ChecklistItem[] {
  const now = input.now ?? Date.now();
  const departureAt = parseDepartureDate(input.departureDate ?? null);
  const completed = input.completed ?? {};

  return CHECKLIST.map((entry) => {
    const isDone = typeof completed[entry.key] === "number";
    const dueAt = departureAt === null ? null : addDays(departureAt, entry.offsetDays);
    const state: ChecklistState = isDone
      ? "done"
      : dueAt === null
        ? "no-date"
        : now >= dueAt
          ? "due"
          : "upcoming";
    return {
      key: entry.key,
      label: entry.label,
      hint: entry.hint,
      milestone: dueAt === null ? null : milestoneLabel(entry.offsetDays),
      dueAt,
      state,
    };
  });
}

export function checklistProgress(items: ChecklistItem[]): {
  done: number;
  total: number;
  percent: number;
} {
  const total = items.length;
  const done = items.filter((item) => item.state === "done").length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/* ------------------------------------------------------------------ *
 * Reorder / renewal intent
 * ------------------------------------------------------------------ */

export type ReorderIntent = {
  packageId: string;
  kind: "reorder" | "renewal";
  label: string;
  /** Canonical destination route; the price is re-read by that route's loader. */
  href: "/checkout/$id";
  /** Secondary path when the package is no longer sold. */
  fallbackDestinationCode: string | null;
};

/**
 * Reorder is never a client-side clone of the old order: it points at the canonical
 * checkout route, whose loader re-reads the live provider catalogue and re-prices.
 */
export function reorderIntent(order: {
  packageId: string;
  status: OrderStatus;
  locationCodes?: string[] | undefined;
}): ReorderIntent {
  const renewal = order.status === "EXPIRED" || order.status === "INSTALLED";
  return {
    packageId: order.packageId,
    kind: renewal ? "renewal" : "reorder",
    label: renewal ? "Perpanjang paket" : "Beli lagi",
    href: "/checkout/$id",
    fallbackDestinationCode: order.locationCodes?.[0] ?? null,
  };
}
