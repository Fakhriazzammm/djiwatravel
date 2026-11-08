import { z } from "zod";

export const DISCOVERY_KEY = "shopperDiscovery";
export const discoveryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  photoEnabled: z.boolean().default(true),
  dailyLimit: z.number().int().min(1).max(100).default(10),
  photoDailyLimit: z.number().int().min(1).max(20).default(5),
  dailyAiRequests: z.number().int().min(1).max(200).default(20),
});
export type DiscoveryConfig = z.infer<typeof discoveryConfigSchema>;
export const DEFAULT_DISCOVERY_CONFIG = discoveryConfigSchema.parse({});
export const REQUEST_LABELS: Record<string, string> = {
  DRAFT: "Hasil pencarian",
  SUBMITTED: "Dikirim",
  SEARCHING: "Sedang dicari",
  NEEDS_INFO: "Perlu informasi",
  OFFERED: "Penawaran tersedia",
  DECLINED: "Penawaran ditolak",
  UNAVAILABLE: "Belum ditemukan",
  ORDERED: "Sudah menjadi pesanan",
  CANCELLED: "Dibatalkan",
};
/** References can be external; only supported official hosts are fetched by the adapter. */
export function parseProductReference(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Gunakan link produk lengkap https://…");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  )
    throw new Error("Gunakan link HTTPS toko publik tanpa akun atau alamat internal.");
  url.hash = "";
  const brand =
    host === "www.uniqlo.com" || host === "uniqlo.com"
      ? ("uniqlo" as const)
      : host === "www.gu-global.com" || host === "gu-global.com"
        ? ("gu" as const)
        : null;
  const match =
    brand && url.pathname.startsWith("/jp/")
      ? url.pathname.match(/\/products\/(E?\d{6}(?:-\d{3})?)/i)
      : null;
  return {
    url: url.toString(),
    host,
    brand: match ? brand : null,
    code: match ? match[1]!.replace(/^E/i, "").split("-")[0]! : null,
  };
}
export function productPhotoMime(bytes: Uint8Array) {
  if (bytes.length > 5242880 || bytes.length < 12) return null;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return "image/png";
  const text = new TextDecoder().decode(bytes.slice(0, 12));
  return text.startsWith("RIFF") && text.endsWith("WEBP") ? "image/webp" : null;
}
const amount = z.number().int().min(0).max(100000000);
export const discoveryOfferSchema = z.object({
  name: z.string().trim().min(3).max(200),
  merchant: z.string().trim().min(2).max(100),
  productUrl: z
    .string()
    .max(2000)
    .transform((v) => parseProductReference(v).url),
  condition: z.string().trim().min(2).max(300),
  variant: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(20),
  unitIdr: amount.refine((v) => v > 0),
  unitJpy: z.number().int().positive().max(10000000),
  rateIdr: z.number().positive().max(1000000),
  domesticIdr: amount,
  feeIdr: amount,
  shippingIdr: amount,
  note: z.string().trim().max(1000).default(""),
});
export type DiscoveryOffer = z.infer<typeof discoveryOfferSchema>;
export function offerTotal(o: DiscoveryOffer) {
  return o.unitIdr * o.quantity + o.domesticIdr + o.feeIdr + o.shippingIdr;
}
export type DiscoveryRequest = {
  id: string;
  sourceUrl: string | null;
  note: string;
  analysis: string | null;
  analysisError: string | null;
  status: string;
  version: number;
  hasPhoto: boolean;
  photoUrl: string | null;
  createdAt: string;
  offer: DiscoveryOffer | null;
  offerExpiresAt: string | null;
  orderId: string | null;
  events: {
    status: string;
    note: string;
    at: string;
    version: number;
    offer: DiscoveryOffer | null;
  }[];
};
export type DiscoverySearchResult = {
  requestId: string;
  products: import("./personal-shopper").ShopperProduct[];
  analysis: string | null;
  message: string;
  exact: boolean;
};

/** Audit note shown to customer and admin when an action has no message of its own. */
export function discoveryEventNote(
  action: "submit" | "reply" | "decline" | "cancel" | "refresh_offer",
  note: string,
) {
  if (note.trim()) return note;
  return {
    submit: "Permintaan dikirim untuk diperiksa tim.",
    reply: "Pelanggan mengirim informasi tambahan.",
    decline: "Penawaran ditolak pelanggan.",
    cancel: "Permintaan dibatalkan oleh pelanggan.",
    refresh_offer: "Pelanggan meminta penawaran baru karena penawaran kedaluwarsa.",
  }[action];
}

/** Reverse proxies can terminate TLS; compare browser Origin with the trusted public origin. */
export function discoveryOriginAllowed(
  origin: string | null,
  publicOrigin: string,
  requestOrigin: string,
  development = false,
) {
  if (!origin) return true;
  const publicUrl = new URL(publicOrigin);
  if (origin === publicUrl.origin) return true;
  if (publicUrl.hostname === "djiwatravel.com" && origin === "https://www.djiwatravel.com")
    return true;
  return development && origin === new URL(requestOrigin).origin;
}
