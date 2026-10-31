import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// RPC declaration; the implementation stays server-only.
export const getDestinationPackages = createServerFn({ method: "GET" })
  .validator(z.string().trim().min(2).max(16))
  .handler(async ({ data }) => {
    const { getDestinationPackagesHandler } = await import("./destination-packages.server");
    return getDestinationPackagesHandler(data);
  });
