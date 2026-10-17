import { RESELLER_CONFIG } from "./reseller-config";

export type PriceInput = {
  providerPriceUnits: number;
  markupPercent?: number;
  fixedMarkupIdr?: number;
  usdToIdr?: number;
  roundingIdr?: number;
};

export type PriceBreakdown = {
  providerCostIdr: number;
  markupIdr: number;
  sellingPriceIdr: number;
  currency: "IDR";
  configSnapshot: Record<string, number>;
};

/** eSIM Access prices are expressed in 1/10,000 USD units. */
export function calculateSellingPrice(input: PriceInput): PriceBreakdown {
  if (!Number.isFinite(input.providerPriceUnits) || input.providerPriceUnits < 0)
    throw new Error("Harga provider tidak valid");
  const markupPercent = input.markupPercent ?? RESELLER_CONFIG.markupPercent;
  const fixedMarkupIdr = input.fixedMarkupIdr ?? RESELLER_CONFIG.fixedMarkupIdr;
  const usdToIdr = input.usdToIdr ?? RESELLER_CONFIG.usdToIdr;
  const roundingIdr = input.roundingIdr ?? RESELLER_CONFIG.roundingIdr;
  if (markupPercent < 0 || fixedMarkupIdr < 0 || usdToIdr <= 0 || roundingIdr <= 0)
    throw new Error("Konfigurasi harga tidak valid");
  const providerCostIdr = Math.round((input.providerPriceUnits / 10_000) * usdToIdr);
  const markupIdr = Math.round((providerCostIdr * markupPercent) / 100) + fixedMarkupIdr;
  const raw = providerCostIdr + markupIdr;
  const sellingPriceIdr = Math.ceil(raw / roundingIdr) * roundingIdr;
  return {
    providerCostIdr,
    markupIdr,
    sellingPriceIdr,
    currency: "IDR",
    configSnapshot: { markupPercent, fixedMarkupIdr, usdToIdr, roundingIdr },
  };
}
