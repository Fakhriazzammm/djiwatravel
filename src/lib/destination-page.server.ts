import { destinations } from "./catalog";
import { getDestinationPackagesHandler } from "./destination-packages.server";
import { readHomeEsimConfig } from "./home-esim-config.server";
import { pickFastPackages } from "./home-quick-packages";
import { readPackageSales } from "./home-quick-packages.server";

const SWITCHER_MAX = 12;

/**
 * Everything the destination page needs in one read: the package list (same reader as Home and
 * Explore), the "Pilihan tercepat" picks (Admin pins in Settings → eSIM Beranda apply here too)
 * and the country switcher, whose order follows the Admin-pinned Home rail.
 */
export async function getDestinationPageHandler(code: string) {
  const data = await getDestinationPackagesHandler(code);
  if (!data) return null;
  const [sales, record] = await Promise.all([
    readPackageSales(data.packages.map((pkg) => pkg.packageCode)),
    readHomeEsimConfig(),
  ]);
  const current = data.destination.code.toUpperCase();
  const pin = record.config.packageHighlights[current] ?? {};
  const pinned = record.config.destinationOrder.map((c) => c.toUpperCase());
  const ordered = [
    ...pinned,
    ...destinations.filter((d) => d.popular).map((d) => d.code.toUpperCase()),
  ];
  const codes = [current, ...ordered.filter((c) => c !== current)];
  const switcher = [...new Set(codes)]
    .flatMap((c) => {
      const d = destinations.find((item) => item.code.toUpperCase() === c);
      return d ? [{ code: d.code, flag: d.flag, nameId: d.nameId }] : [];
    })
    .slice(0, SWITCHER_MAX);
  return {
    ...data,
    picks: pickFastPackages(data.packages, sales, pin),
    switcher,
    network: data.destination.network ?? null,
  };
}
