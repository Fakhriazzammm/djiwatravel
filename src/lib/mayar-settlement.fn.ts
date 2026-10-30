import { createServerFnProxy, executeServerFn } from "./server-fn-proxy";
import type * as Server from "./mayar-settlement.server";

export const verifyMayarPayment = createServerFnProxy<
  Parameters<typeof Server.verifyMayarPayment>[0]["data"],
  Awaited<ReturnType<typeof Server.verifyMayarPayment>>
>("POST", async (data) =>
  executeServerFn((await import("./mayar-settlement.server")).verifyMayarPayment, "POST", data),
);
