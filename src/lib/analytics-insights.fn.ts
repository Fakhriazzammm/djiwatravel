import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { INSIGHT_RANGES, INSIGHT_TABS } from "./analytics-insights";

export const getAnalyticsInsights = createServerFn({ method: "GET" })
  .validator(z.object({ tab: z.enum(INSIGHT_TABS), range: z.enum(INSIGHT_RANGES) }))
  .handler(async ({ data }) => {
    const { getAnalyticsInsightsHandler } = await import("./analytics-insights.server");
    return getAnalyticsInsightsHandler(data.tab, data.range);
  });

/** Lightweight alert list for the dashboard banner; never throws into the page. */
export const getAdminAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./admin-guard");
  await requireAdmin();
  try {
    const { getAlertInput } = await import("./analytics-insights.server");
    const { evaluateAlerts } = await import("./analytics-insights");
    return evaluateAlerts(await getAlertInput());
  } catch (error) {
    console.error("admin_alerts_failed", error instanceof Error ? error.message : error);
    return [];
  }
});
