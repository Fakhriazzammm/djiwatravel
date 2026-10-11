import type { CustomerWalletLedgerEntry } from "./customer-wallet.server";

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

export function groupWalletLedger(entries: CustomerWalletLedgerEntry[], locale = "id-ID"): WalletLedgerGroup[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const groups = new Map<string, WalletLedgerGroup>();
  for (const entry of sorted) {
    const date = new Date(entry.created_at);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
    const group = groups.get(key) ?? { key, label, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

type CustomerWallet = { status: "active" | "blocked" };
