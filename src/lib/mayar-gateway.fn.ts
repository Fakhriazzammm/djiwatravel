import { createServerFnProxy, executeServerFn } from "./server-fn-proxy";
import type * as Server from "./mayar-gateway";

export type { MayarInvoice, MayarTransaction } from "./mayar-gateway";

export const createMayarInvoice = createServerFnProxy<
  Parameters<typeof Server.createMayarInvoice>[0]["data"],
  Awaited<ReturnType<typeof Server.createMayarInvoice>>
>("POST", async (data) =>
  executeServerFn((await import("./mayar-gateway")).createMayarInvoice, "POST", data),
);

export const rebuildMayarInvoice = createServerFnProxy<
  Parameters<typeof Server.rebuildMayarInvoice>[0]["data"],
  Awaited<ReturnType<typeof Server.rebuildMayarInvoice>>
>("POST", async (data) =>
  executeServerFn((await import("./mayar-gateway")).rebuildMayarInvoice, "POST", data),
);
