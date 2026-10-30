import { createNoArgServerFnProxy, executeServerFn } from "./server-fn-proxy";

export const getCustomerAppConfig = createNoArgServerFnProxy("GET", async () =>
  executeServerFn((await import("./customer-app-config.server")).getCustomerAppConfig, "GET"),
);
