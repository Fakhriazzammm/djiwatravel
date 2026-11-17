/**
 * Data-allowance conventions shared by the catalogue and every customer-facing label.
 *
 * eSIM Access reports volumes in GiB (3 GB is 3221225472 bytes, not 3e9) and marks an unmetered
 * plan with a 999 GiB sentinel instead of a flag: "Japan No-Throttling-Unlimited 7Days" reports
 * 1072668082176 bytes. Dividing that sentinel by 1e9 is what printed "1073 GB data" on the
 * destination page, so both facts live here to keep every surface consistent.
 */
export const BYTES_PER_GB = 1024 ** 3;
export const BYTES_PER_MB = 1024 ** 2;
export const UNLIMITED_VOLUME_BYTES = 999 * BYTES_PER_GB;

/** True when the provider volume is its "unmetered" sentinel rather than a real allowance. */
export function isUnlimitedVolume(bytes: number | null | undefined): boolean {
  return typeof bytes === "number" && Number.isFinite(bytes) && bytes >= UNLIMITED_VOLUME_BYTES;
}

/** Only a provider flag or an explicit "Unlimited" name marks a plan as unmetered. */
export function isUnlimitedPlan(pkg: { name?: string | null; unlimited?: unknown }): boolean {
  return pkg.unlimited === true || /unlimited/i.test(pkg.name ?? "");
}
