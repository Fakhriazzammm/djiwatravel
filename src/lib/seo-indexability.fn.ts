import { createServerFn } from "@tanstack/react-start";

const getIndexablePlanRpc = createServerFn({ method: "GET" })
  .validator(
    (data: Parameters<typeof import("./seo-indexability.server").getIndexablePlan>) => data,
  )
  .handler(async ({ data }) => {
    const { getIndexablePlan } = await import("./seo-indexability.server");
    const result = await getIndexablePlan(...data);
    return result ? { package: result.package } : null;
  });

export function getIndexablePlan(
  ...args: Parameters<typeof import("./seo-indexability.server").getIndexablePlan>
) {
  return getIndexablePlanRpc({ data: args });
}
