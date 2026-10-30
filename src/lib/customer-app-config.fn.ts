import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getCustomerAppConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getCustomerAppConfigHandler } = await import("./customer-app-config.server");
  return getCustomerAppConfigHandler();
});
