/** Temporary reseller defaults. Replace with DB/admin settings before launch. */
export const RESELLER_CONFIG = {
  markupPercent: 25,
  fixedMarkupIdr: 0,
  usdToIdr: 17_000,
  roundingIdr: 1_000,
  currency: "IDR" as const,
  customerAuth: "guest-order-token" as const,
  encryption: "server-environment-key-placeholder" as const,
};
