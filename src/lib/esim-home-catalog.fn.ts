import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Keep the provider catalog, prices and sellability checks on the server.
export const searchHomeEsimCatalog = createServerFn({ method: "GET" })
  .validator(z.string().trim().min(2).max(80))
  .handler(async ({ data }) => {
    const { searchHomeEsimCatalogHandler } = await import("./esim-home-catalog.server");
    return searchHomeEsimCatalogHandler(data);
  });
