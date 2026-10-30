import { createServerFnProxy } from "./server-fn-proxy";
import type * as Server from "./seo-indexability.server";

export type { IndexablePlan } from "./seo-indexability.server";

const getIndexablePlanRpc = createServerFnProxy<
  string,
  Awaited<ReturnType<typeof Server.getIndexablePlan>>
>("GET", async (id) => {
  const { getIndexablePlan } = await import("./seo-indexability.server");
  return getIndexablePlan(id);
});

const getIndexablePlansRpc = createServerFnProxy<
  number | undefined,
  Awaited<ReturnType<typeof Server.getIndexablePlans>>
>("GET", async (deadlineMs) => {
  const { getIndexablePlans } = await import("./seo-indexability.server");
  return getIndexablePlans(deadlineMs);
});

export const getIndexablePlan = (id: string) => getIndexablePlanRpc({ data: id });
export const getIndexablePlans = (deadlineMs?: number) => getIndexablePlansRpc({ data: deadlineMs });
