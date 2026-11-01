/**
 * What Djiwa Pay offers beyond the balance, mirrored here only to *tell* the customer where to
 * go. Djiwa Pay owns availability, pricing, and execution; Travel never runs these flows.
 *
 * Source: the Djiwa Pay app bundle (apps/djiwapay, action list and PPOB catalogue), read on
 * 2026-11-01. `available: false` mirrors Pay's own "Soon" state (Tarik Dana). Pay's card action is
 * also "Soon" and is intentionally not listed. Re-check against Pay when its catalogue changes.
 */
export type PayAction = {
  id: "send" | "receive" | "scan-qr" | "withdraw";
  label: string;
  hint: string;
  asset: string;
  available: boolean;
};

const ASSET = "/assets/djiwa-pay-actions";

export const PAY_ACTIONS: readonly PayAction[] = [
  { id: "send", label: "Kirim", hint: "Ke pengguna", asset: `${ASSET}/send.webp`, available: true },
  {
    id: "receive",
    label: "Terima",
    hint: "Tunjukkan kode",
    asset: `${ASSET}/receive.webp`,
    available: true,
  },
  {
    id: "scan-qr",
    label: "Scan QR",
    hint: "Bayar via QR",
    asset: `${ASSET}/scan-qr.webp`,
    available: true,
  },
  {
    id: "withdraw",
    label: "Tarik Dana",
    hint: "Segera hadir",
    asset: `${ASSET}/withdraw.webp`,
    available: false,
  },
];

export const PAY_PPOB_ASSET = `${ASSET}/bills.png`;

/** PPOB catalogue shown as chips; each opens Djiwa Pay. */
export const PAY_PPOB_SERVICES: readonly string[] = [
  "Pulsa",
  "Paket Data",
  "Token PLN",
  "Tagihan PLN",
  "PDAM",
  "BPJS",
  "TV & Streaming",
  "Voucher Game",
  "Cicilan",
];

/** Quick actions Travel runs itself; everything else lives in Djiwa Pay. */
export const NATIVE_WALLET_ACTIONS: readonly string[] = ["Isi Saldo", "Riwayat", "Bantuan"];
