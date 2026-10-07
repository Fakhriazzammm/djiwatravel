export function resolveCheckoutPackage<T extends { packageCode: string }>(
  packages: readonly T[],
  packageCode: string,
): T | null {
  return packages.find((pkg) => pkg.packageCode === packageCode) ?? null;
}
