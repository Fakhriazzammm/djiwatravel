import { createServerFnProxy, executeServerFn } from "./server-fn-proxy";
import type * as Server from "./ai/admin-insight.server";

export const generateAdminAIInsight = createServerFnProxy<
  Parameters<typeof Server.generateAdminAIInsight>[0]["data"],
  Awaited<ReturnType<typeof Server.generateAdminAIInsight>>
>("POST", async (data) =>
  executeServerFn(
    (await import("./ai/admin-insight.server")).generateAdminAIInsight,
    "POST",
    data,
  ),
);
