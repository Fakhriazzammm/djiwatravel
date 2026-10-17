import type { PriceBreakdown } from "./reseller-pricing";

export type PriceLock = PriceBreakdown & { lockedAt: string; fxSource: string; lockId: string };
export function createPriceLock(
  price: PriceBreakdown,
  input: { fxSource: string; now?: Date; lockId: string },
): PriceLock {
  if (!input.fxSource.trim()) throw new Error("Sumber FX wajib dicatat");
  if (!input.lockId.trim()) throw new Error("Lock ID wajib diisi");
  return {
    ...price,
    lockedAt: (input.now ?? new Date()).toISOString(),
    fxSource: input.fxSource.trim(),
    lockId: input.lockId.trim(),
  };
}
