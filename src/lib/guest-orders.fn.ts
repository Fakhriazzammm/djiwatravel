import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const createGuestOrderDraft = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./guest-orders.server").createGuestOrderDraftInput>[0],
    ) => {
      const { createGuestOrderDraftInput } = await import("./guest-orders.server");
      return createGuestOrderDraftInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { createGuestOrderDraftHandler } = await import("./guest-orders.server");
    return createGuestOrderDraftHandler({ data });
  });

export const getGuestOrders = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./guest-orders.server").getGuestOrdersInput>[0]) => {
      const { getGuestOrdersInput } = await import("./guest-orders.server");
      return getGuestOrdersInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getGuestOrdersHandler } = await import("./guest-orders.server");
    return getGuestOrdersHandler({ data });
  });
