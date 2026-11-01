import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// RPC declaration; the implementation stays server-only.
export const getDestinationPackages = createServerFn({ method: "GET" })
  .validator(z.string().trim().min(2).max(16))
  .handler(async ({ data }) => {
    const { getDestinationPackagesHandler } = await import("./destination-packages.server");
    return getDestinationPackagesHandler(data);
  });

// Destination page bundle: packages + fast picks + country switcher (see destination-page.server).
export const getDestinationPage = createServerFn({ method: "GET" })
  .validator(z.string().trim().min(2).max(16))
  .handler(async ({ data }) => {
    const { getDestinationPageHandler } = await import("./destination-page.server");
    return getDestinationPageHandler(data);
  });
