import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getCustomerWallet = createServerFn({ method: "GET" })
  .validator(
    async (
      data: Parameters<typeof import("./customer-wallet.server").getCustomerWalletInput>[0],
    ) => {
      const { getCustomerWalletInput } = await import("./customer-wallet.server");
      return getCustomerWalletInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getCustomerWalletHandler } = await import("./customer-wallet.server");
    return getCustomerWalletHandler({ data });
  });
