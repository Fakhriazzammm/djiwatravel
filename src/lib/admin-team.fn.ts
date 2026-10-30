import { createNoArgServerFnProxy, executeServerFn } from "./server-fn-proxy";

export const getAdminTeam = createNoArgServerFnProxy("GET", async () =>
  executeServerFn((await import("./admin-team.server")).getAdminTeam, "GET"),
);
