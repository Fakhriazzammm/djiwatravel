import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const previewCataloguePricing = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./price-rules.server").previewCataloguePricingInput>[0],
    ) => {
      const { previewCataloguePricingInput } = await import("./price-rules.server");
      return previewCataloguePricingInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { previewCataloguePricingHandler } = await import("./price-rules.server");
    return previewCataloguePricingHandler({ data });
  });

export const applyCataloguePricing = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./price-rules.server").applyCataloguePricingInput>[0],
    ) => {
      const { applyCataloguePricingInput } = await import("./price-rules.server");
      return applyCataloguePricingInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { applyCataloguePricingHandler } = await import("./price-rules.server");
    return applyCataloguePricingHandler({ data });
  });

export const rollbackPricingBatch = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./price-rules.server").rollbackPricingBatchInput>[0],
    ) => {
      const { rollbackPricingBatchInput } = await import("./price-rules.server");
      return rollbackPricingBatchInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { rollbackPricingBatchHandler } = await import("./price-rules.server");
    return rollbackPricingBatchHandler({ data });
  });

export const readPriceRuleHistory = createServerFn({ method: "GET" })
  .validator(
    async (
      data: Parameters<typeof import("./price-rules.server").readPriceRuleHistoryInput>[0],
    ) => {
      const { readPriceRuleHistoryInput } = await import("./price-rules.server");
      return readPriceRuleHistoryInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { readPriceRuleHistoryHandler } = await import("./price-rules.server");
    return readPriceRuleHistoryHandler({ data });
  });

export const setPackagePriceInline = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./price-rules.server").setPackagePriceInlineInput>[0],
    ) => {
      const { setPackagePriceInlineInput } = await import("./price-rules.server");
      return setPackagePriceInlineInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { setPackagePriceInlineHandler } = await import("./price-rules.server");
    return setPackagePriceInlineHandler({ data });
  });
