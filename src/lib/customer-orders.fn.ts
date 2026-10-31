import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const createAuthenticatedOrder = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./customer-orders.server").createAuthenticatedOrderInput>[0],
    ) => {
      const { createAuthenticatedOrderInput } = await import("./customer-orders.server");
      return createAuthenticatedOrderInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { createAuthenticatedOrderDraftHandler } = await import("./customer-orders.server");
    return createAuthenticatedOrderDraftHandler({ data });
  });
