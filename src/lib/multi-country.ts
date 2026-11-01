import { regionForCountry } from "./destination-availability";

/**
 * Multi-country ("regional") bundles, derived only from the eSIM Access catalogue.
 *
 * A bundle is any provider package whose location list holds more than one country. Nothing here
 * invents a bundle: the group a package belongs to is computed from the country codes the provider
 * returned, so a bundle appears on Home/Finder/destination pages exactly when the provider lists it
 * and the sellability rules allow it.
 */

export type BundleGroupCode =
  "ASIA" | "EU" | "AMERIKA" | "AFRIKA" | "OSEANIA" | "TIMURTENGAH" | "GLOBAL";

export const BUNDLE_GROUPS: Record<
  BundleGroupCode,
  { label: string; flag: string; regionLabel: string | null }
> = {
  ASIA: { label: "Asia", flag: "🌏", regionLabel: "Asia" },
  EU: { label: "Eropa", flag: "🇪🇺", regionLabel: "Eropa" },
  AMERIKA: { label: "Amerika", flag: "🌎", regionLabel: "Amerika" },
  AFRIKA: { label: "Afrika", flag: "🌍", regionLabel: "Afrika" },
  OSEANIA: { label: "Oseania", flag: "🏝️", regionLabel: "Oseania" },
  TIMURTENGAH: { label: "Timur Tengah", flag: "🕌", regionLabel: "Timur Tengah" },
  GLOBAL: { label: "Global", flag: "🌐", regionLabel: null },
};

/** Display order on the Finder: the regions travellers ask for most first, Global last. */
export const BUNDLE_GROUP_ORDER: BundleGroupCode[] = [
  "ASIA",
  "EU",
  "GLOBAL",
  "AMERIKA",
  "TIMURTENGAH",
  "OSEANIA",
  "AFRIKA",
];

/** A bundle this wide, or spanning this many regions, is "Global" regardless of its home region. */
export const GLOBAL_MIN_COUNTRIES = 30;
export const GLOBAL_MIN_REGIONS = 3;

const GROUP_BY_REGION_LABEL = new Map(
  (
    Object.entries(BUNDLE_GROUPS) as Array<
      [BundleGroupCode, (typeof BUNDLE_GROUPS)[BundleGroupCode]]
    >
  )
    .filter(([, value]) => value.regionLabel)
    .map(([code, value]) => [value.regionLabel as string, code] as const),
);

export function isMultiCountry(pkg: { locationCodes: readonly string[] }): boolean {
  return new Set(pkg.locationCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)).size > 1;
}

/** Which regional group a bundle's provider country list belongs to. */
export function classifyBundle(locationCodes: readonly string[]): BundleGroupCode {
  const codes = [...new Set(locationCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const tally = new Map<string, number>();
  for (const code of codes) {
    const region = regionForCountry(code);
    tally.set(region, (tally.get(region) ?? 0) + 1);
  }
  if (codes.length >= GLOBAL_MIN_COUNTRIES || tally.size >= GLOBAL_MIN_REGIONS) return "GLOBAL";
  const [top] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return (top && GROUP_BY_REGION_LABEL.get(top[0])) || "GLOBAL";
}

export function isBundleGroupCode(code: string): code is BundleGroupCode {
  return Object.hasOwn(BUNDLE_GROUPS, code.trim().toUpperCase());
}

/** The multi-country packages that belong to one regional group. */
export function packagesForBundleGroup<T extends { locationCodes: readonly string[] }>(
  packages: readonly T[],
  group: string,
): T[] {
  const wanted = group.trim().toUpperCase();
  return packages.filter(
    (pkg) => isMultiCountry(pkg) && classifyBundle(pkg.locationCodes) === wanted,
  );
}

export type BundleGroupSummary = {
  code: BundleGroupCode;
  label: string;
  flag: string;
  packageCount: number;
  countryCount: number;
  fromPriceIdr: number;
};

export function summarizeBundleGroups(
  packages: ReadonlyArray<{ locationCodes: readonly string[]; priceIdr: number }>,
): BundleGroupSummary[] {
  const buckets = new Map<
    BundleGroupCode,
    { count: number; countries: Set<string>; from: number }
  >();
  for (const pkg of packages) {
    if (!isMultiCountry(pkg) || !(pkg.priceIdr > 0)) continue;
    const code = classifyBundle(pkg.locationCodes);
    const bucket = buckets.get(code) ?? { count: 0, countries: new Set<string>(), from: Infinity };
    bucket.count += 1;
    bucket.from = Math.min(bucket.from, pkg.priceIdr);
    for (const c of pkg.locationCodes) bucket.countries.add(c.trim().toUpperCase());
    buckets.set(code, bucket);
  }
  return BUNDLE_GROUP_ORDER.flatMap((code) => {
    const bucket = buckets.get(code);
    if (!bucket) return [];
    const meta = BUNDLE_GROUPS[code];
    return [
      {
        code,
        label: meta.label,
        flag: meta.flag,
        packageCount: bucket.count,
        countryCount: bucket.countries.size,
        fromPriceIdr: bucket.from,
      },
    ];
  });
}
