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
  target: EsimHomeTarget;
  primaryAction: EsimHomeAction;
  secondaryAction?: EsimHomeAction;
  hasMultiple: boolean;
};

const PENDING_STATUSES: readonly OrderStatus[] = [
  "ORDER_CREATED",
  "WAITING_PAYMENT",
  "PAID",
  "PROVISIONING",
];

function newest(orders: Order[]): Order | null {
  return [...orders].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

function locationLabel(order: Order): string {
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

function packageSubtitle(order: Order): string {
  const parts = [locationLabel(order)];
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
    target: { kind: "detail", id: order.id },
    primaryAction: low ? renewalAction : detailAction,
    secondaryAction: low ? detailAction : renewalAction,
    hasMultiple,
  };
}

function buildReadySummary(order: Order, hasMultiple: boolean): EsimHomeSummary {
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

  const resolved = orders.map((order) => ({
    order,
    status: effectiveOrderStatus(order.status, order.expiresAt, now),
  }));
  const hasMultiple = orders.length > 1;
  const installed = resolved.filter(({ status }) => status === "INSTALLED");
  const lowInstalled = installed
    .map(({ order }) => ({
      order,
      usage: usageView({
        volumeBytes: order.usageVolumeBytes ?? order.volumeBytes ?? null,
        usedGb: order.usedGb ?? null,
        unlimited: order.unlimited === true,
        active: true,
      }),
    }))
    .filter(({ usage }) => usage.kind === "measured" && usage.low);
  const low = newest(lowInstalled.map(({ order }) => order));
  if (low) return buildActiveSummary(low, "INSTALLED", hasMultiple);

  const active = newest(installed.map(({ order }) => order));
  if (active) return buildActiveSummary(active, "INSTALLED", hasMultiple);

  const ready = newest(
    resolved.filter(({ status }) => status === "READY").map(({ order }) => order),
  );
  if (ready) return buildReadySummary(ready, hasMultiple);

  const pending = newest(
    resolved.filter(({ status }) => PENDING_STATUSES.includes(status)).map(({ order }) => order),
  );
  if (pending) {
    const status = resolved.find(({ order }) => order.id === pending.id)?.status ?? pending.status;
    return buildPendingSummary(pending, status, hasMultiple);
  }

  const failed = newest(
    resolved.filter(({ status }) => status === "PROVISIONING_FAILED").map(({ order }) => order),
  );
  if (failed) return buildPendingSummary(failed, "PROVISIONING_FAILED", hasMultiple);

  const history = newest(resolved.map(({ order }) => order));
  const historyStatus =
    resolved.find(({ order }) => order.id === history?.id)?.status ?? history?.status;
  return history && historyStatus
    ? buildHistorySummary(history, historyStatus, hasMultiple)
    : emptySummary();
}
