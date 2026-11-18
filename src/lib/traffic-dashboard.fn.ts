import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { RANGE_KEYS, resolveRange } from "./date-range";

export const getTrafficDashboard = createServerFn({ method: "GET" })
  .validator(
    z.object({
      range: z.enum(RANGE_KEYS),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { getTrafficDashboardHandler } = await import("./traffic-dashboard.server");
    return getTrafficDashboardHandler(resolveRange(data, "24j"));
  });
