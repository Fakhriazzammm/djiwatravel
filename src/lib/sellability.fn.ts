import { createServerFnProxy } from "./server-fn-proxy";
import type * as Server from "./sellability.server";

const readSellabilityRpc = createServerFnProxy<
  Parameters<typeof Server.getSellabilityState>[0],
  Awaited<ReturnType<typeof Server.getSellabilityState>>
>("POST", async (packages) => {
  const { getSellabilityState } = await import("./sellability.server");
  return getSellabilityState(packages);
});

export const getSellabilityState = (
  packages: Parameters<typeof Server.getSellabilityState>[0],
) => readSellabilityRpc({ data: packages });
