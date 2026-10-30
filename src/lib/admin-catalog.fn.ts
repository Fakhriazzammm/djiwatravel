import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const readAdminCatalogPage = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./admin-catalog.server").readAdminCatalogPageInput>[0],
    ) => {
      const { readAdminCatalogPageInput } = await import("./admin-catalog.server");
      return readAdminCatalogPageInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { readAdminCatalogPageHandler } = await import("./admin-catalog.server");
    return readAdminCatalogPageHandler({ data });
  });
