import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getAdminReadiness = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminReadinessHandler } = await import("./admin-readiness.server");
  return getAdminReadinessHandler();
});
