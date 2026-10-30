import { createServerFnProxy, executeServerFn } from "./server-fn-proxy";
import type * as Server from "./admin-catalog.server";

export type { AdminCatalogReadInput } from "./admin-catalog.server";

export const readAdminCatalogPage = createServerFnProxy<
  Parameters<typeof Server.readAdminCatalogPage>[0]["data"],
  Awaited<ReturnType<typeof Server.readAdminCatalogPage>>
>("POST", async (data) =>
  executeServerFn((await import("./admin-catalog.server")).readAdminCatalogPage, "POST", data),
);
