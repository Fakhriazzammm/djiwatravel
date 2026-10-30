import { createServerFn } from "@tanstack/react-start";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getAdminEmail = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminEmailHandler } = await import("./admin-guard.server");
  return getAdminEmailHandler();
});

export const isAdminRequest = createServerFn({ method: "GET" }).handler(async () => {
  const { isAdminRequestHandler } = await import("./admin-guard.server");
  return isAdminRequestHandler();
});
