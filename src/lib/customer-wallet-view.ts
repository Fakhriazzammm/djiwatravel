import type { CustomerDirectPayment, CustomerWalletLedgerEntry } from "./customer-wallet.server";

export type WalletLedgerGroup = {
  key: string;
  label: string;
  entries: CustomerWalletLedgerEntry[];
};

export function walletStatusLabel(status: CustomerWallet["status"]): string {
  return status === "active" ? "Aktif" : "Dibatasi";
}

export function ledgerStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    posted: "Berhasil",
    completed: "Berhasil",
    settled: "Berhasil",
    pending: "Menunggu",
    processing: "Diproses",
    failed: "Gagal",
    reversed: "Dibatalkan",
  };
  return labels[status.toLowerCase()] ?? status;
}

export function groupWalletLedger(
  entries: CustomerWalletLedgerEntry[],
  locale = "id-ID",
): WalletLedgerGroup[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const groups = new Map<string, WalletLedgerGroup>();
  for (const entry of sorted) {
    const date = new Date(entry.created_at);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
    const group = groups.get(key) ?? { key, label, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

type CustomerWallet = { status: "active" | "blocked" };

/** Order states that mean the customer has paid, whatever happened to the eSIM afterwards. */
const PAID_ORDER_STATUSES = new Set([
  "PAID",
  "PROVISIONING",
  "READY",
  "INSTALLED",
  "PROVISIONING_FAILED",
  "REFUNDED",
]);

export type TravelPurchaseRow = {
  id: string;
  title: string;
  reference: string;
  createdAtMs: number;
  amount: number;
  statusLabel: string;
  methodLabel: string;
};

const PURCHASE_STATUS_LABELS: Record<string, string> = {
  PAID: "Dibayar",
  PROVISIONING: "eSIM disiapkan",
  READY: "eSIM siap",
  INSTALLED: "eSIM terpasang",
  PROVISIONING_FAILED: "Dibayar, eSIM dalam penanganan",
  REFUNDED: "Dikembalikan",
};

const DIRECT_METHOD_LABELS: Record<string, string> = {
  qris: "QRIS",
  va: "Virtual account",
  cash: "Tunai",
  djiwaapp: "Djiwa App",
};

function directMethodLabel(method: string | null | undefined): string {
  const key = (method ?? "").trim().toLowerCase();
  return DIRECT_METHOD_LABELS[key] ?? (key ? key.toUpperCase() : "Pembayaran langsung");
}

const BRAND_LABELS: Record<string, string> = {
  djiwatentram: "Djiwa Tentram",
  "djiwa-tentram": "Djiwa Tentram",
  ordermieyamin: "Order Mie Yamin",
  b2b: "B2B",
};

/**
 * Orders from the other Djiwa apps (served by the canonical Pay service on the other VPS) that were
 * paid straight through the gateway. Same rule as Travel purchases: read-only history that never
 * alters the balance.
 */
export function canonicalDirectPurchases(
  payments: readonly CustomerDirectPayment[],
): TravelPurchaseRow[] {
  return payments.map((payment) => {
    const brand = (payment.brand_slug ?? "").trim().toLowerCase();
    const app = BRAND_LABELS[brand] ?? (brand ? brand : "Djiwa Tentram");
    return {
      id: `pay-${payment.source_id}`,
      title: `Pesanan ${app}${payment.order_number ? ` #${payment.order_number}` : ""}`,
      reference: payment.order_number ?? payment.source_id,
      createdAtMs: payment.created_at,
      amount: payment.total_amount,
      statusLabel: "Berhasil",
      methodLabel: directMethodLabel(payment.payment_method),
    };
  });
}

/**
 * Travel purchases paid straight through the payment provider (QRIS/VA).
 *
 * Those never move the Djiwa Pay balance, so the Pay ledger has no row for them. Purchases paid
 * from the balance are skipped here because the ledger already lists them; showing both would count
 * the same order twice. These rows are read-only history, not wallet movements.
 */
export function travelDirectPurchases(
  orders: ReadonlyArray<{
    id: string;
    publicOrderCode: string;
    status: string;
    amount: number;
    createdAtMs: number;
    paymentMethod: string;
    paymentProvider?: string | null;
    packageSnapshot: { name: string };
  }>,
): TravelPurchaseRow[] {
  return orders
    .filter(
      (order) =>
        PAID_ORDER_STATUSES.has(order.status) &&
        order.paymentProvider === "mayar" &&
        order.paymentMethod !== "djiwa_pay",
    )
    .map((order) => ({
      id: order.id,
      title: `eSIM ${order.packageSnapshot.name}`,
      reference: order.publicOrderCode,
      createdAtMs: order.createdAtMs,
      amount: order.amount,
      statusLabel: PURCHASE_STATUS_LABELS[order.status] ?? "Dibayar",
      methodLabel: directMethodLabel(order.paymentMethod),
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export type WalletHistoryItem =
  | { kind: "ledger"; atMs: number; entry: CustomerWalletLedgerEntry }
  | { kind: "purchase"; atMs: number; purchase: TravelPurchaseRow };

export type WalletHistoryGroup = { key: string; label: string; items: WalletHistoryItem[] };

/**
 * One chronological history, grouped by month: balance movements from the Pay ledger plus Travel
 * purchases paid directly. Both are read-only here; purchases never alter the balance.
 */
export function groupWalletHistory(
  ledger: readonly CustomerWalletLedgerEntry[],
  purchases: readonly TravelPurchaseRow[],
  locale = "id-ID",
): WalletHistoryGroup[] {
  const items: WalletHistoryItem[] = [
    ...ledger.map((entry) => ({
      kind: "ledger" as const,
      atMs: new Date(entry.created_at).getTime(),
      entry,
    })),
    ...purchases.map((purchase) => ({
      kind: "purchase" as const,
      atMs: purchase.createdAtMs,
      purchase,
    })),
  ].sort((a, b) => b.atMs - a.atMs);
  const groups = new Map<string, WalletHistoryGroup>();
  for (const item of items) {
    const date = new Date(item.atMs);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}
