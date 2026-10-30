import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getMemberOrders = createServerFn({ method: "GET" }).handler(async () => {
  const { getMemberOrdersHandler } = await import("./member-orders.server");
  return getMemberOrdersHandler();
});

export const claimGuestOrderForMember = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./member-orders.server").claimGuestOrderForMemberInput>[0],
    ) => {
      const { claimGuestOrderForMemberInput } = await import("./member-orders.server");
      return claimGuestOrderForMemberInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { claimGuestOrderForMemberHandler } = await import("./member-orders.server");
    return claimGuestOrderForMemberHandler({ data });
  });
