import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// RPC declaration; the implementation (sales query, Admin pins) stays server-only.
export const getHomeQuickPackages = createServerFn({ method: "GET" })
  .validator(z.string().trim().min(2).max(16))
  .handler(async ({ data }) => {
    const { getHomeQuickPackagesHandler } = await import("./home-quick-packages.server");
    return getHomeQuickPackagesHandler(data);
  });
