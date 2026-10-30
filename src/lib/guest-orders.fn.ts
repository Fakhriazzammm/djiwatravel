import { createServerFnProxy, executeServerFn } from "./server-fn-proxy";
import type * as Server from "./guest-orders.server";

export const createGuestOrderDraft = createServerFnProxy<
  Parameters<typeof Server.createGuestOrderDraft>[0]["data"],
  Awaited<ReturnType<typeof Server.createGuestOrderDraft>>
>("POST", async (data) =>
  executeServerFn((await import("./guest-orders.server")).createGuestOrderDraft, "POST", data),
);

export const getGuestOrders = createServerFnProxy<
  Parameters<typeof Server.getGuestOrders>[0]["data"],
  Awaited<ReturnType<typeof Server.getGuestOrders>>
>("POST", async (data) =>
  executeServerFn((await import("./guest-orders.server")).getGuestOrders, "POST", data),
);
