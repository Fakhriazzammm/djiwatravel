import { formatFlightPrice } from "./flights";
import { packageCoverageLabel, packageDataLabel, packageDestinationLabel } from "./package-copy";
import type { ViewPackage } from "./package-view";
import { FLIGHT_PRICE_NOTE, flightRouteUrl, type PublicFlightFares } from "./public-flight-fares";
import { SEO_BASE_URL } from "./seo";

export function buildPublicPricesText(
  flights: PublicFlightFares[],
  esim: { syncedAt: number; packages: ViewPackage[] } | null,
  shipping: { priceIdr: number; minKg: number } | null,
) {
  return [
    "# Harga publik Djiwa Travel",
    "",
    "## Tiket pesawat",
    FLIGHT_PRICE_NOTE,
    ...flights.flatMap(({ route, fares }) =>
      fares.map(
        (fare) =>
          `- ${route.from} ke ${route.to} (${fare.origin}–${fare.destination}), ${fare.departureAt.slice(0, 10)}: ${formatFlightPrice(fare.priceIdr)} IDR. Diambil ${fare.checkedAt}. Sumber dan cek ulang: ${flightRouteUrl(route)}`,
      ),
    ),
    ...(flights.some(({ fares }) => fares.length) ? [] : ["Tarif referensi belum tersedia."]),
    "",
    "## Paket eSIM tersedia",
    "Harga dalam Rupiah (IDR). Periksa harga dan ketersediaan terbaru di halaman paket sebelum membeli.",
    ...(esim && esim.packages.length
      ? [
          `Katalog dibaca dari pembaruan ${new Date(esim.syncedAt).toISOString()}.`,
          ...esim.packages.map(
            (plan) =>
              `- eSIM ${packageDestinationLabel(plan) ?? plan.name} (cakupan ${packageCoverageLabel(plan)}), ${packageDataLabel(plan)}, ${plan.durationDays} hari: ${formatFlightPrice(plan.priceIdr)} IDR — ${SEO_BASE_URL}/plan/${encodeURIComponent(plan.packageCode)}`,
          ),
        ]
      : ["Harga paket belum tersedia."]),
    "",
    "## Kirim barang ke Jepang",
    ...(shipping
      ? [
          `Tarif publik ${formatFlightPrice(shipping.priceIdr)} per kg, minimum ${shipping.minKg.toLocaleString("id-ID")} kg. Sumber: ${SEO_BASE_URL}/kirim-barang`,
        ]
      : [`Lihat ketersediaan layanan: ${SEO_BASE_URL}/kirim-barang`]),
    "",
  ].join("\n");
}
