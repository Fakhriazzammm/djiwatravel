import { createServerFn } from "@tanstack/react-start";

export const decideAdminRefund = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminRefundInput } = await import("./admin-refunds.server");
    return adminRefundInput(data);
  })
  .handler(async ({ data }) => {
    const { decideAdminRefundHandler } = await import("./admin-refunds.server");
    return decideAdminRefundHandler({ data });
  });
