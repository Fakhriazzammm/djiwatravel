import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";

const isAdminRequest = createServerFn({ method: "GET" }).handler(async () => {
  const { isAdminRequest: readAdminRequest } = await import("@/lib/admin-guard.server");
  return readAdminRequest();
});

/**
 * Route guard for /admin/*.
 *
 * Runs in `beforeLoad`, so the check happens on the server for a cold load and again on the
 * client for in-app navigation. Anyone who is not an allow-listed admin (see
 * `admin-guard.server.ts`) is sent to the dedicated Google admin sign-in entry.
 */
export async function requireAdmin() {
  let allowed = false;
  try {
    allowed = await isAdminRequest();
  } catch {
    allowed = false;
  }
  if (!allowed) throw redirect({ to: "/admin/login", replace: true });
}
