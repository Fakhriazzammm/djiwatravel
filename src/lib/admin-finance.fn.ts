import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getTravelFinanceReport = createServerFn({ method: "GET" })
  .validator(
    async (
      data: Parameters<typeof import("./admin-finance.server").getTravelFinanceReportInput>[0],
    ) => {
      const { getTravelFinanceReportInput } = await import("./admin-finance.server");
      return getTravelFinanceReportInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { getTravelFinanceReportHandler } = await import("./admin-finance.server");
    return getTravelFinanceReportHandler({ data });
  });

export const submitTravelExpense = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./admin-finance.server").submitTravelExpenseInput>[0],
    ) => {
      const { submitTravelExpenseInput } = await import("./admin-finance.server");
      return submitTravelExpenseInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { submitTravelExpenseHandler } = await import("./admin-finance.server");
    return submitTravelExpenseHandler({ data });
  });
