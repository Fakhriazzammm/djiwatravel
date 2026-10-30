import { createServerFnProxy, executeServerFn } from "./server-fn-proxy";
import type * as Server from "./admin-finance.server";

export type { TravelFinanceReportView } from "./admin-finance.server";

export const getTravelFinanceReport = createServerFnProxy<
  Parameters<typeof Server.getTravelFinanceReport>[0]["data"],
  Awaited<ReturnType<typeof Server.getTravelFinanceReport>>
>("GET", async (data) =>
  executeServerFn((await import("./admin-finance.server")).getTravelFinanceReport, "GET", data),
);

export const submitTravelExpense = createServerFnProxy<
  Parameters<typeof Server.submitTravelExpense>[0]["data"],
  Awaited<ReturnType<typeof Server.submitTravelExpense>>
>("POST", async (data) =>
  executeServerFn((await import("./admin-finance.server")).submitTravelExpense, "POST", data),
);
