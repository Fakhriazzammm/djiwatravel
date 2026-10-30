import { createServerFnProxy, executeServerFn } from "./server-fn-proxy";
import type * as Server from "./customer-wallet.server";

export type { CustomerWalletResponse, CustomerWalletLedgerEntry } from "./customer-wallet.server";

export const getCustomerWallet = createServerFnProxy<
  Parameters<typeof Server.getCustomerWallet>[0]["data"],
  Awaited<ReturnType<typeof Server.getCustomerWallet>>
>("GET", async (data) =>
  executeServerFn((await import("./customer-wallet.server")).getCustomerWallet, "GET", data),
);
