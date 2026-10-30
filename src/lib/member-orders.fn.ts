import { createNoArgServerFnProxy, createServerFnProxy, executeServerFn } from "./server-fn-proxy";
import type * as Server from "./member-orders.server";

export const getMemberOrders = createNoArgServerFnProxy("GET", async () =>
  executeServerFn((await import("./member-orders.server")).getMemberOrders, "GET"),
);

export const claimGuestOrderForMember = createServerFnProxy<
  Parameters<typeof Server.claimGuestOrderForMember>[0]["data"],
  Awaited<ReturnType<typeof Server.claimGuestOrderForMember>>
>("POST", async (data) =>
  executeServerFn(
    (await import("./member-orders.server")).claimGuestOrderForMember,
    "POST",
    data,
  ),
);
