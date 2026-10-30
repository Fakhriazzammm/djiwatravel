import { effectiveOrderStatus } from "./esim-status";
import type { Order, OrderStatus } from "./orders";
import {
  formatData,
  formatGb,
  formatRemainingPercent,
  reorderIntent,
  usageView,
  type UsageView,
} from "./travel-journey";

export type EsimHomeTarget =
  | { kind: "finder" }
  | { kind: "list" }
  | { kind: "detail"; id: string }
  | { kind: "order"; id: string }
  | { kind: "checkout"; id: string };

export type EsimHomeAction = {
  label: string;
  target: EsimHomeTarget;
};

export type EsimHomeSummaryKind = "empty" | "pending" | "ready" | "active" | "low" | "history";

export type EsimHomeSummary = {
  kind: EsimHomeSummaryKind;
  eyebrow: string;
  title: string;
  subtitle: string;
  quotaLabel: string | null;
  remainingPercent: number | null;
  quotaValue?: string;
  quotaCaption?: string;
  measuredAt?: number;
  location?: string;
  flag?: string;
  dataLabel?: string;
  expiresLabel?: string;
  orderCode?: string;
  amountLabel?: string;
  target: EsimHomeTarget;
  primaryAction: EsimHomeAction;
  secondaryAction?: EsimHomeAction;
  hasMultiple: boolean;
};

/**
 * The Home card surfaces whatever needs the customer next, not merely the
 * newest purchase: unpaid orders expire, ready eSIMs must be installed before
 * departure, and a nearly empty active eSIM matters more than a healthy one.
 * A paid order that is still provisioning has no customer action, so it sits
 * below an eSIM the traveler can actually use right now.
 */
export function esimHomeOrderRank(status: OrderStatus, order: Order): number {
  if (status === "ORDER_CREATED" || status === "WAITING_PAYMENT") return 0;
  if (status === "PROVISIONING_FAILED") return 1;
  if (status === "READY") return 2;
  if (status === "INSTALLED") {
    const usage = usageView({
      volumeBytes: order.usageVolumeBytes ?? order.volumeBytes ?? null,
      usedGb: order.usedGb ?? null,
      unlimited: order.unlimited === true,
      active: true,
    });
    return usage.kind === "measured" && usage.low ? 3 : 4;
  }
  if (status === "PAID" || status === "PROVISIONING") return 5;
  return 6;
}

/** Orders in the order the Home card pages through them. */
export function sortEsimHomeOrders(orders: Order[], now = Date.now()): Order[] {
  return orders
    .map((order) => {
      const status = effectiveOrderStatus(order.status, order.expiresAt, now);
      return { order, status, rank: esimHomeOrderRank(status, order) };
    })
    .sort((a, b) => a.rank - b.rank || b.order.createdAt - a.order.createdAt)
    .map(({ order }) => order);
}

export function esimHomeOrderLocation(order: Order): string {
  const codes = order.locationCodes ?? [];
  if (codes.length === 0) return "Internasional";
  if (codes.length > 1) return `Regional · ${codes.length} negara`;
  const code = codes[0]?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(code)) return code || "Internasional";
  try {
    return new Intl.DisplayNames(["id-ID"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function esimHomeOrderFlag(order: Order): string {
  const codes = order.locationCodes ?? [];
  const code = codes.length === 1 ? (codes[0]?.trim().toUpperCase() ?? "") : "";
  if (!/^[A-Z]{2}$/.test(code)) return "🌏";
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

function dataLabel(order: Order): string | undefined {
  if (order.unlimited === true) return "Unlimited";
  const bytes = order.volumeBytes;
  return bytes !== null && bytes !== undefined && bytes > 0 ? formatGb(bytes) : undefined;
}

function activeUntilLabel(expiresAt: number | undefined, now: number): string | undefined {
  if (!expiresAt || expiresAt <= now) return undefined;
  const date = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(new Date(expiresAt));
  return `Aktif hingga ${date}`;
}

function amountLabel(amount: number): string {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function packageSubtitle(order: Order): string {
  const parts = [esimHomeOrderLocation(order)];
  if (order.durationDays && order.durationDays > 0) parts.push(`${order.durationDays} hari`);
  return parts.join(" · ");
}

function checkoutAction(order: Order, status: OrderStatus): EsimHomeAction {
  const reorder = reorderIntent({
    packageId: order.packageId,
    status,
    locationCodes: order.locationCodes,
  });
  return {
    label: "Beli paket lagi",
    target: { kind: "checkout", id: reorder.packageId },
  };
}

function quotaLabel(usage: UsageView): string {
  if (
    usage.kind === "measured" &&
    usage.remainingBytes !== null &&
    usage.remainingPercent !== null
  ) {
    return `Sisa ${formatData(usage.remainingBytes)} (${formatRemainingPercent(usage)})`;
  }
  if (usage.kind === "unlimited") return "Unlimited";
  if (usage.totalBytes !== null)
    return `Pemakaian belum dilaporkan penyedia · total ${formatGb(usage.totalBytes)}`;
  return "Pemakaian belum tersedia dari penyedia";
}

function emptySummary(): EsimHomeSummary {
  return {
    kind: "empty",
    eyebrow: "eSIM internasional",
    title: "Internet siap sebelum berangkat",
    subtitle: "Pilih eSIM untuk destinasi perjalananmu.",
    quotaLabel: null,
    remainingPercent: null,
    target: { kind: "finder" },
    primaryAction: { label: "Cari eSIM", target: { kind: "finder" } },
    hasMultiple: false,
  };
}

function buildActiveSummary(
  order: Order,
  status: "INSTALLED",
  hasMultiple: boolean,
  now: number,
): EsimHomeSummary {
  const usage = usageView({
    volumeBytes: order.usageVolumeBytes ?? order.volumeBytes ?? null,
    usedGb: order.usedGb ?? null,
    measuredAt: order.usageMeasuredAt ?? null,
    unlimited: order.unlimited === true,
    active: true,
  });
  const low = usage.kind === "measured" && usage.low;
  const detailAction: EsimHomeAction = {
    label: "Lihat eSIM",
    target: { kind: "detail", id: order.id },
  };
  const renewalAction = checkoutAction(order, status);
  const data = dataLabel(order);
  const activeUntil = activeUntilLabel(order.expiresAt, now);

  return {
    kind: low ? "low" : "active",
    eyebrow: low ? "Kuota hampir habis" : "eSIM aktif",
    title: order.packageName ?? order.packageId,
    subtitle: packageSubtitle(order),
    quotaLabel: quotaLabel(usage),
    remainingPercent: usage.remainingPercent,
    ...(usage.kind === "measured" && usage.remainingBytes !== null && usage.totalBytes !== null
      ? {
          quotaValue: formatData(usage.remainingBytes),
          quotaCaption: `dari ${formatGb(usage.totalBytes)} · ${formatRemainingPercent(usage)} tersisa`,
        }
      : {}),
    ...(usage.measuredAt === null ? {} : { measuredAt: usage.measuredAt }),
    location: esimHomeOrderLocation(order),
    flag: esimHomeOrderFlag(order),
    ...(data ? { dataLabel: data } : {}),
    ...(activeUntil ? { expiresLabel: activeUntil } : {}),
    target: { kind: "detail", id: order.id },
    primaryAction: low ? renewalAction : detailAction,
    secondaryAction: low ? detailAction : renewalAction,
    hasMultiple,
  };
}

function buildReadySummary(order: Order, hasMultiple: boolean): EsimHomeSummary {
  const data = dataLabel(order);
  return {
    kind: "ready",
    eyebrow: "eSIM siap dipasang",
    title: order.packageName ?? order.packageId,
    subtitle: packageSubtitle(order),
    quotaLabel:
      order.unlimited === true
        ? "Unlimited"
        : order.volumeBytes != null && order.volumeBytes > 0
          ? `${formatGb(order.volumeBytes)} total`
          : "Informasi kuota tersedia di detail eSIM",
    remainingPercent: null,
    location: esimHomeOrderLocation(order),
    flag: esimHomeOrderFlag(order),
    ...(data ? { dataLabel: data } : {}),
    target: { kind: "detail", id: order.id },
    primaryAction: {
      label: "Pasang eSIM",
      target: { kind: "detail", id: order.id },
    },
    secondaryAction: checkoutAction(order, "READY"),
    hasMultiple,
  };
}

function buildPendingSummary(
  order: Order,
  status: OrderStatus,
  hasMultiple: boolean,
): EsimHomeSummary {
  const paymentPending = status === "ORDER_CREATED" || status === "WAITING_PAYMENT";
  const failed = status === "PROVISIONING_FAILED";
  const data = dataLabel(order);
  return {
    kind: "pending",
    eyebrow: failed ? "Butuh bantuan" : "Pesanan eSIM",
    title: failed
      ? "eSIM perlu bantuan"
      : paymentPending
        ? "Pembayaran belum selesai"
        : "eSIM sedang disiapkan",
    subtitle: `${order.packageName ?? order.packageId} · ${packageSubtitle(order)}`,
    quotaLabel: null,
    remainingPercent: null,
    location: esimHomeOrderLocation(order),
    flag: esimHomeOrderFlag(order),
    ...(data ? { dataLabel: data } : {}),
    ...(order.publicOrderCode ? { orderCode: order.publicOrderCode } : {}),
    ...(Number.isFinite(order.amount) ? { amountLabel: amountLabel(order.amount) } : {}),
    target: { kind: "order", id: order.id },
    primaryAction: {
      label: paymentPending ? "Lanjutkan pembayaran" : "Lihat status",
      target: { kind: "order", id: order.id },
    },
    hasMultiple,
  };
}

function buildHistorySummary(
  order: Order,
  status: OrderStatus,
  hasMultiple: boolean,
): EsimHomeSummary {
  return {
    kind: "history",
    eyebrow: "Riwayat eSIM",
    title: "Siap terhubung lagi?",
    subtitle: `${order.packageName ?? order.packageId} · ${packageSubtitle(order)}`,
    quotaLabel: null,
    remainingPercent: null,
    target: { kind: "list" },
    primaryAction: checkoutAction(order, status),
    ...(!hasMultiple
      ? { secondaryAction: { label: "Lihat semua eSIM", target: { kind: "list" as const } } }
      : {}),
    hasMultiple,
  };
}

export function buildEsimHomeSummary(orders: Order[], now = Date.now()): EsimHomeSummary {
  if (orders.length === 0) return emptySummary();

  const resolved = sortEsimHomeOrders(orders, now).map((order) => ({
    order,
    status: effectiveOrderStatus(order.status, order.expiresAt, now),
  }));
  const hasMultiple = orders.length > 1;
  const top = resolved[0];
  if (!top) return emptySummary();

  switch (top.status) {
    case "INSTALLED":
      return buildActiveSummary(top.order, "INSTALLED", hasMultiple, now);
    case "READY":
      return buildReadySummary(top.order, hasMultiple);
    case "ORDER_CREATED":
    case "WAITING_PAYMENT":
    case "PAID":
    case "PROVISIONING":
    case "PROVISIONING_FAILED":
      return buildPendingSummary(top.order, top.status, hasMultiple);
    default:
      return buildHistorySummary(top.order, top.status, hasMultiple);
  }
}
