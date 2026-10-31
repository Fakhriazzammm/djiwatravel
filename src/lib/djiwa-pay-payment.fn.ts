import { createServerFn } from "@tanstack/react-start";
import { walletPaymentInputSchema } from "./travel-payment-method";

export const chargeTravelOrderWithDjiwaPay = createServerFn({ method: "POST" })
  .validator(walletPaymentInputSchema)
  .handler(async ({ data }) => {
    const { chargeTravelOrderWithDjiwaPayHandler } = await import("./djiwa-pay-payment.server");
    return chargeTravelOrderWithDjiwaPayHandler({ data });
  });
