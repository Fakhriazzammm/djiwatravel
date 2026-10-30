import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const verifyMayarPayment = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./mayar-settlement.server").verifyMayarPaymentInput>[0],
    ) => {
      const { verifyMayarPaymentInput } = await import("./mayar-settlement.server");
      return verifyMayarPaymentInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { verifyMayarPaymentHandler } = await import("./mayar-settlement.server");
    return verifyMayarPaymentHandler({ data });
  });
