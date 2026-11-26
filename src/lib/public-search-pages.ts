import { SEO_BASE_URL } from "./seo";

export const PUBLIC_SEARCH_PAGES = [
  { path: "/", label: "Beranda Djiwa Travel" },
  { path: "/explore", label: "Destinasi dan paket eSIM" },
  { path: "/esim/finder", label: "Cari paket eSIM sesuai perjalanan" },
  { path: "/panduan", label: "Panduan travel" },
  { path: "/template", label: "Template itinerary publik" },
  { path: "/titip-belanja", label: "Titip belanja dan estimasi harga produk Jepang" },
  { path: "/kirim-barang", label: "Kirim barang ke Jepang dan tarif per kilogram" },
  { path: "/support", label: "Bantuan pelanggan" },
  { path: "/privacy", label: "Kebijakan privasi" },
  { path: "/terms", label: "Syarat dan ketentuan" },
] as const;

export function canonicalSearchPage(path: string) {
  return [{ rel: "canonical", href: `${SEO_BASE_URL}${path}` }];
}

// Match complete path segments. Public product detail and itinerary routes remain discoverable.
const NON_SEARCH_PATH =
  /^\/(?:admin|api|checkout|order|order-status|receipt|refund|e|wallet|my-esim|my-orders|my-trips|my-templates|profile|notifications|privasi-akun|affiliate|share|bagikan-tiket|petugas|travo|feeds|explore\/(?:aku|aktivitas)|titip-belanja\/(?:pesan|pesanan)|kirim-barang\/[^/]+)(?:\/|$)/;

export function isNonSearchPage(path: string) {
  return NON_SEARCH_PATH.test(path);
}
