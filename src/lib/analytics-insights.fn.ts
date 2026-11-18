import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { INSIGHT_RANGES, INSIGHT_TABS } from "./analytics-insights";

export const getAnalyticsInsights = createServerFn({ method: "GET" })
  .validator(z.object({ tab: z.enum(INSIGHT_TABS), range: z.enum(INSIGHT_RANGES) }))
  .handler(async ({ data }) => {
    const { getAnalyticsInsightsHandler } = await import("./analytics-insights.server");
    return getAnalyticsInsightsHandler(data.tab, data.range);
  });
