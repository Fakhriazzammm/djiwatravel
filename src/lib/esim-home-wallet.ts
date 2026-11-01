/**
 * View model for the eSIM cards inside the Home card (the horizontal "eSIM kamu" rail).
 *
 * One entry per purchased eSIM, ordered by what the traveller needs next: unpaid or failed
 * orders, ready-to-install, low quota, healthy active, still provisioning, then expired.
 * Cancelled and refunded orders are not eSIMs and never appear. Pure so the rail, the tests and
 * any Admin preview read the same numbers.
 */

import { effectiveOrderStatus } from "./esim-status";
import { esimHomeOrderFlag, esimHomeOrderLocation, type EsimHomeTarget } from "./esim-home-summary";
import type { Order, OrderStatus } from "./orders";
import { formatData, formatGb, usageView } from "./travel-journey";

export type EsimWalletKind = "active" | "low" | "ready" | "pending" | "expired";
export type EsimWalletTone = "normal" | "low" | "muted";

export type EsimWalletCard = {
  id: string;
  kind: EsimWalletKind;
  status: OrderStatus;
  flag: string;
  location: string;
  /** Large figure: remaining data when measured, otherwise the plan size. */
  headline: string;
  /** Small text next to the headline, e.g. "tersisa dari 5.0 GB". */
  caption: string;
  /** Remaining share (0-100) for the bar; null hides the bar rather than inventing a figure. */
  percent: number | null;
  tone: EsimWalletTone;
  /** Left meta, e.g. "Terpakai 2.4 GB". */
  usedLabel: string | null;
  /** Right meta, e.g. "Sisa 3 hari". */
  timeLabel: string | null;
  measuredAt: number | null;
  /** Where tapping the card goes. */
  target: EsimHomeTarget;
  /** Primary action; `buy` opens the checkout sheet for `packageId`. */
  action:
    | { kind: "link"; label: string; target: EsimHomeTarget; primary: boolean }
    | { kind: "buy"; label: string; packageId: string; primary: boolean };
  packageId: string;
  /** For `pending` cards: the status that drives the activation stepper. */
  pendingTitle?: string;
};

const DAY = 86_400_000;

function planLabel(order: Order): string | null {
  if (order.unlimited === true) return "Unlimited";
  return order.volumeBytes != null && order.volumeBytes > 0 ? formatGb(order.volumeBytes) : null;
}

export function daysLeft(expiresAt: number | undefined, now: number): number | null {
  if (!expiresAt || expiresAt <= now) return null;
  return Math.max(1, Math.ceil((expiresAt - now) / DAY));
}

function endedLabel(expiresAt: number | undefined): string | null {
  if (!expiresAt) return null;
  const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(
    new Date(expiresAt),
  );
  return `Berakhir ${date}`;
}

function buildCard(
  order: Order,
  status: OrderStatus,
  now: number,
  lowPercent: number | undefined,
): EsimWalletCard {
  const base = {
    id: order.id,
    status,
    flag: esimHomeOrderFlag(order),
    location: esimHomeOrderLocation(order),
    packageId: order.packageId,
    measuredAt: null as number | null,
  };
  const plan = planLabel(order);
  const duration =
    order.durationDays && order.durationDays > 0 ? `${order.durationDays} hari` : null;
  const detail: EsimHomeTarget = { kind: "detail", id: order.id };
  const rebuy = (label: string, primary: boolean): EsimWalletCard["action"] => ({
    kind: "buy",
    label,
    packageId: order.packageId,
    primary,
  });

  if (status === "INSTALLED") {
    const usage = usageView({
      volumeBytes: order.usageVolumeBytes ?? order.volumeBytes ?? null,
      usedGb: order.usedGb ?? null,
      measuredAt: order.usageMeasuredAt ?? null,
      unlimited: order.unlimited === true,
      active: true,
      lowPercent,
    });
    const low = usage.kind === "measured" && usage.low;
    const left = daysLeft(order.expiresAt, now);
    const timeLabel = left ? `Sisa ${left} hari` : null;
    const measured =
      usage.kind === "measured" && usage.remainingBytes !== null && usage.totalBytes !== null;
    return {
      ...base,
      kind: low ? "low" : "active",
      headline: measured
        ? formatData(usage.remainingBytes as number)
        : usage.kind === "unlimited"
          ? "Unlimited"
          : (plan ?? "eSIM aktif"),
      caption: measured
        ? `tersisa dari ${formatGb(usage.totalBytes as number)}`
        : usage.kind === "unlimited"
          ? "tanpa batas kuota"
          : "pemakaian belum dilaporkan",
      percent: measured ? usage.remainingPercent : null,
      tone: low ? "low" : "normal",
      usedLabel:
        measured && usage.usedBytes !== null ? `Terpakai ${formatData(usage.usedBytes)}` : null,
      timeLabel,
      measuredAt: usage.measuredAt,
      target: detail,
      action: low
        ? rebuy("Beli paket lagi", true)
        : { kind: "link", label: "Lihat eSIM", target: detail, primary: false },
    };
  }

  if (status === "READY") {
    return {
      ...base,
      kind: "ready",
      headline: plan ?? "eSIM siap",
      caption: duration ? `· ${duration}` : "siap dipasang",
      percent: 100,
      tone: "normal",
      usedLabel: "Terpakai 0 GB",
      timeLabel: "Aktif setelah dipasang",
      target: detail,
      action: { kind: "link", label: "Pasang eSIM", target: detail, primary: true },
    };
  }

  if (status === "EXPIRED") {
    return {
      ...base,
      kind: "expired",
      headline: plan ?? "eSIM",
      caption: "masa aktif habis",
      percent: null,
      tone: "muted",
      usedLabel: null,
      timeLabel: endedLabel(order.expiresAt),
      target: detail,
      action: rebuy("Beli lagi", false),
    };
  }

  const paymentPending = status === "ORDER_CREATED" || status === "WAITING_PAYMENT";
  const failed = status === "PROVISIONING_FAILED";
  const orderTarget: EsimHomeTarget = { kind: "order", id: order.id };
  return {
    ...base,
    kind: "pending",
    headline: plan ?? "Pesanan eSIM",
    caption: duration ? `· ${duration}` : "",
    percent: null,
    tone: "normal",
    usedLabel: null,
    timeLabel: null,
    target: orderTarget,
    pendingTitle: failed
      ? "eSIM perlu bantuan"
      : paymentPending
        ? "Pembayaran belum selesai"
        : "eSIM sedang disiapkan",
    action: {
      kind: "link",
      label: paymentPending ? "Lanjutkan pembayaran" : "Lihat status",
      target: orderTarget,
      primary: paymentPending,
    },
  };
}

/** Active first (low quota ahead of healthy), then ready to install, in progress, expired last. */
const KIND_RANK: Record<EsimWalletKind, number> = {
  low: 0,
  active: 1,
  ready: 2,
  pending: 3,
  expired: 4,
};

export function buildEsimWalletCards(
  orders: readonly Order[],
  now = Date.now(),
  lowPercent?: number,
): EsimWalletCard[] {
  return orders
    .map((order) => ({ order, status: effectiveOrderStatus(order.status, order.expiresAt, now) }))
    .filter(({ status }) => status !== "CANCELLED" && status !== "REFUNDED")
    .map(({ order, status }) => ({
      order,
      card: buildCard(order, status, now, lowPercent),
    }))
    .sort(
      (a, b) =>
        KIND_RANK[a.card.kind] - KIND_RANK[b.card.kind] || b.order.createdAt - a.order.createdAt,
    )
    .map(({ card }) => card);
}
