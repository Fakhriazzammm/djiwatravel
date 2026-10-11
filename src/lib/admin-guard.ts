import { redirect } from "@tanstack/react-router";

import { isAdminRequest } from "@/lib/admin-guard.server";

/**
 * Route guard for /admin/*.
 *
 * Runs in `beforeLoad`, so the check happens on the server for a cold load and again on the
 * client for in-app navigation. Anyone who is not an allow-listed admin (see
 * `admin-guard.server.ts`) is sent to /profile, which carries the sign-in form — there is no
 * /login route in this app.
 */
export async function requireAdmin() {
  let allowed = false;
  try {
    allowed = await isAdminRequest();
  } catch {
    allowed = false;
  }
  if (!allowed) throw redirect({ to: "/profile", search: { admin: "unauthorized" }, replace: true });
}
