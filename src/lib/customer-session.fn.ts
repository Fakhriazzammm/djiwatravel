import { isLocalDevelopmentHost, LOCAL_DEMO_USER } from "./local-development";

export type { AuthenticatedUser } from "./customer-session.server";

/**
 * Resolve the current customer directly inside server handlers.
 *
 * This must remain a regular server helper: wrapping it in a server RPC makes
 * nested server functions depend on a client manifest entry that can be omitted
 * from production builds.
 */
export async function getAuthenticatedUser(cookie?: string) {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const host = getRequestHeader("host")?.split(":")[0];
  if (isLocalDevelopmentHost(host)) return LOCAL_DEMO_USER;
  const requestCookie = cookie ?? getRequestHeader("cookie");
  const { authenticateCustomerCookie } = await import("./customer-session.server");
  return authenticateCustomerCookie(requestCookie ?? "");
}
