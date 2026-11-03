import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSiteTraffic = createServerFn({ method: "GET" })
  .validator(z.object({ period: z.enum(["daily", "weekly", "monthly"]) }))
  .handler(async ({ data }) => {
    const { getSiteTrafficHandler } = await import("./site-events.server");
    return getSiteTrafficHandler(data.period);
  });
