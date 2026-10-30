import { createServerFnProxy, executeServerFn } from "./server-fn-proxy";
import type * as Server from "./price-rules.server";

export type { PriceRuleEventView, PricingPreviewResult } from "./price-rules.server";

const previewCataloguePricing = createServerFnProxy<
  Parameters<typeof Server.previewCataloguePricing>[0]["data"],
  Awaited<ReturnType<typeof Server.previewCataloguePricing>>
>("POST", async (data) =>
  executeServerFn((await import("./price-rules.server")).previewCataloguePricing, "POST", data),
);
const applyCataloguePricing = createServerFnProxy<
  Parameters<typeof Server.applyCataloguePricing>[0]["data"],
  Awaited<ReturnType<typeof Server.applyCataloguePricing>>
>("POST", async (data) =>
  executeServerFn((await import("./price-rules.server")).applyCataloguePricing, "POST", data),
);
const rollbackPricingBatch = createServerFnProxy<
  Parameters<typeof Server.rollbackPricingBatch>[0]["data"],
  Awaited<ReturnType<typeof Server.rollbackPricingBatch>>
>("POST", async (data) =>
  executeServerFn((await import("./price-rules.server")).rollbackPricingBatch, "POST", data),
);
const readPriceRuleHistory = createServerFnProxy<
  Parameters<typeof Server.readPriceRuleHistory>[0]["data"],
  Awaited<ReturnType<typeof Server.readPriceRuleHistory>>
>("GET", async (data) =>
  executeServerFn((await import("./price-rules.server")).readPriceRuleHistory, "GET", data),
);
const setPackagePriceInline = createServerFnProxy<
  Parameters<typeof Server.setPackagePriceInline>[0]["data"],
  Awaited<ReturnType<typeof Server.setPackagePriceInline>>
>("POST", async (data) =>
  executeServerFn((await import("./price-rules.server")).setPackagePriceInline, "POST", data),
);

export {
  applyCataloguePricing,
  previewCataloguePricing,
  readPriceRuleHistory,
  rollbackPricingBatch,
  setPackagePriceInline,
};
