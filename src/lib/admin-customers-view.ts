import type { AdminCustomerRow } from "./admin-customers.server";

/** Pure display helpers for Admin Customers (no database access, unit-tested). */

export type CustomerView = "daftar" | "analisis";

export const CUSTOMER_KIND_FILTERS = ["all", "member", "guest", "noprofile"] as const;

export const CUSTOMER_CRITERIA_LABEL = {
  all: "Semua kriteria",
  ordered: "Pernah memesan",
  never: "Belum pernah memesan",
  trip: "Punya perjalanan",
  shopping: "Pakai Titip Belanja",
  feed: "Posting di Feeds",
} as const;

export const CUSTOMER_SORT_LABEL = {
  active: "Aktif terbaru",
  joined: "Terbaru bergabung",
  orders: "Order terbanyak",
  spend: "Belanja terbesar",
} as const;

export function customerName(
  customer: Pick<AdminCustomerRow, "displayName" | "kind" | "profileComplete" | "email">,
) {
  if (customer.displayName) return customer.displayName;
  if (customer.kind === "guest") return "Tamu (tanpa akun)";
  return customer.profileComplete ? "Belum mengisi nama" : "Belum melengkapi profil";
}

export function customerInitial(
  customer: Pick<AdminCustomerRow, "displayName" | "email" | "kind">,
): string {
  const source = (customer.displayName ?? customer.email ?? "").trim();
  const letter = source.match(/[\p{L}\p{N}]/u)?.[0];
  return letter ? letter.toUpperCase() : customer.kind === "guest" ? "T" : "?";
}

const AVATAR_TONES = [
  "bg-[#1f2937] text-white",
  "bg-[#0f766e] text-white",
  "bg-[#7c3aed] text-white",
  "bg-[#b45309] text-white",
  "bg-[#1d4ed8] text-white",
  "bg-[#be123c] text-white",
];

/** Stable colour per customer so the same person keeps the same avatar. */
export function avatarTone(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? AVATAR_TONES[0]!;
}

/** Short Indonesian rupiah, e.g. Rp0, Rp350.000, Rp1,2 jt. */
export function rupiahCompact(value: number): string {
  if (value >= 1_000_000) {
    const millions = Math.round(value / 100_000) / 10;
    return `Rp${String(millions).replace(".", ",")} jt`;
  }
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export function pageWindow(page: number, pageCount: number): number[] {
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const end = Math.min(pageCount, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function customerCsvRows(rows: AdminCustomerRow[]): (string | number | null)[][] {
  return [
    [
      "ID",
      "Jenis",
      "Nama",
      "Email",
      "WhatsApp",
      "Profil lengkap",
      "Order",
      "Pembayaran",
      "Belanja (IDR)",
      "Perjalanan",
      "Titip Belanja",
      "Post Feeds",
      "Pertama terlihat",
      "Aktivitas terakhir",
    ],
    ...rows.map((row) => [
      row.ref,
      row.kind === "guest" ? "Tamu" : "Member",
      row.displayName,
      row.email,
      row.whatsapp,
      row.kind === "guest" ? "" : row.profileComplete ? "Ya" : "Tidak",
      row.orderCount,
      row.paidCount,
      row.spendIdr,
      row.tripCount,
      row.shoppingCount,
      row.feedPostCount,
      row.firstSeenAt,
      row.lastActivityAt,
    ]),
  ];
}

/** Whole-percent share, null when the base is empty. */
export function sharePct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
