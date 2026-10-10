import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

/** Same upstream Better Auth instance the rest of the app trusts. */
const AUTH_SESSION_URL = "https://auth.zantara.id/api/auth/get-session";
const AUTH_ORIGIN = "https://djiwatravel.com";

type BetterAuthSession = { user?: { email?: string | null } | null } | null;

/**
 * Comma-separated allowlist of admin emails, read from `ADMIN_EMAILS`.
 *
 * It fails closed on purpose: with nothing configured (or an unreachable auth service) nobody
 * reaches /admin/*, and the fix is one env var plus a restart rather than a code change.
 */
export function adminEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const allowed = adminEmails(env);
  if (allowed.length === 0) return false;
  const value = (email ?? "").trim().toLowerCase();
  return value !== "" && allowed.includes(value);
}

/** Email of the Better Auth session behind this request, or null when there is none. */
async function readSignedInEmail(): Promise<string | null> {
  const cookie = getRequestHeader("cookie");
  if (!cookie) return null;
  try {
    const response = await fetch(AUTH_SESSION_URL, {
      headers: { cookie, origin: AUTH_ORIGIN, accept: "application/json" },
    });
    if (!response.ok) return null;
    const session = (await response.json()) as BetterAuthSession;
    return session?.user?.email ?? null;
  } catch {
    return null;
  }
}

export const getAdminEmail = createServerFn({ method: "GET" }).handler(async () =>
  readSignedInEmail(),
);

/** True only for an allow-listed admin with a valid Better Auth session. */
export const isAdminRequest = createServerFn({ method: "GET" }).handler(async () =>
  isAdminEmail(await readSignedInEmail()),
);
