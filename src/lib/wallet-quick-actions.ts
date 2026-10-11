export type WalletQuickAction = {
  label: string;
  asset: string;
  supported: boolean;
  badgeClass?: string;
};

export const WALLET_ACTIONS: readonly WalletQuickAction[] = [
  { label: "Isi Saldo", asset: "/assets/djiwa-pay-actions/topup.webp", supported: true },
  { label: "Kirim", asset: "/assets/djiwa-pay-actions/send.webp", supported: false, badgeClass: "bg-violet-500" },
  { label: "Terima", asset: "/assets/djiwa-pay-actions/receive.webp", supported: false, badgeClass: "bg-emerald-500" },
  { label: "Scan QR", asset: "/assets/djiwa-pay-actions/scan-qr.webp", supported: false, badgeClass: "bg-cyan-600" },
  { label: "Riwayat", asset: "/assets/djiwa-pay-actions/history.webp", supported: true },
  { label: "Kartu", asset: "/assets/djiwa-pay-actions/card.webp", supported: false, badgeClass: "bg-indigo-500" },
  { label: "Tarik Dana", asset: "/assets/djiwa-pay-actions/withdraw.webp", supported: false, badgeClass: "bg-orange-500" },
  { label: "Bantuan", asset: "/assets/djiwa-pay-actions/help.webp", supported: true },
];

export function quickActionSoonCopy(label: string) {
  return `Fitur ${label} sedang kami siapkan untuk Djiwa Pay.`;
}

export const QUICK_ACTION_SUPPORT_COPY =
  "Dukungan tersedia melalui customer service Djiwa Travel.";
