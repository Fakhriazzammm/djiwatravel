import { createNoArgServerFnProxy, executeServerFn } from "./server-fn-proxy";

export const getAdminReadiness = createNoArgServerFnProxy("GET", async () =>
  executeServerFn((await import("./admin-readiness.server")).getAdminReadiness, "GET"),
);
