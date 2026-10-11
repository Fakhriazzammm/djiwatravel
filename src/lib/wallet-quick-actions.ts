export type WalletQuickAction = {
  label: string;
  asset: string;
  supported: boolean;
};

export const WALLET_ACTIONS: readonly WalletQuickAction[] = [
  { label: "Isi Saldo", asset: "/assets/djiwa-pay-actions/topup.webp", supported: true },
  { label: "Kirim", asset: "/assets/djiwa-pay-actions/send.webp", supported: false },
  { label: "Terima", asset: "/assets/djiwa-pay-actions/receive.webp", supported: false },
  { label: "Scan QR", asset: "/assets/djiwa-pay-actions/scan-qr.webp", supported: false },
  { label: "Riwayat", asset: "/assets/djiwa-pay-actions/history.webp", supported: true },
  { label: "Kartu", asset: "/assets/djiwa-pay-actions/card.webp", supported: false },
  { label: "Tarik Dana", asset: "/assets/djiwa-pay-actions/withdraw.webp", supported: false },
  { label: "Bantuan", asset: "/assets/djiwa-pay-actions/help.webp", supported: true },
];

export function quickActionSoonCopy(label: string) {
  return `Fitur ${label} sedang kami siapkan untuk Djiwa Pay.`;
}

export const QUICK_ACTION_SUPPORT_COPY =
  "Dukungan tersedia melalui customer service Djiwa Travel.";
