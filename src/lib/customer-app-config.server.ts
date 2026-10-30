import { createServerFn } from "@tanstack/react-start";

import { readCustomerAppConfig } from "./customer-app-config";

/**
 * Browser-callable accessor for the storefront configuration.
 *
 * The parsers, defaults and types live in `customer-app-config.ts` so the wallet screen can import
 * the defaults without pulling a server module into the client bundle.
 */
export const getCustomerAppConfigHandler = async () => readCustomerAppConfig(process.env);

export const getCustomerAppConfig = createServerFn({ method: "GET" }).handler(
  getCustomerAppConfigHandler,
);
