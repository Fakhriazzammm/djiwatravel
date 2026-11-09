import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TRAFFIC_RANGES } from "./traffic-dashboard";

export const getTrafficDashboard = createServerFn({ method: "GET" })
  .validator(z.object({ range: z.enum(TRAFFIC_RANGES) }))
  .handler(async ({ data }) => {
    const { getTrafficDashboardHandler } = await import("./traffic-dashboard.server");
    return getTrafficDashboardHandler(data.range);
  });
