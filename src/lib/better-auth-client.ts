import { isLocalDevelopmentHost, LOCAL_DEMO_USER } from "./local-development";

const CANONICAL_AUTH_BASE = "https://api.djiwatentram.web.id/api/auth";
const AUTH_BASE =
  typeof window === "undefined"
    ? (import.meta.env["VITE_BETTER_AUTH_URL"] || CANONICAL_AUTH_BASE).replace(/\/$/, "")
    : "/api/auth";
export type BetterAuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  /** Google profile photo URL when the account signed in with Google. */
  image?: string | null;
};
export type BetterAuthSession = {
  user: BetterAuthUser;
  session: { id: string; expiresAt: string };
} | null;
async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${AUTH_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload?.message || payload?.error?.message || "Permintaan autentikasi gagal");
  return payload;
}
export function getBetterAuthSession() {
  if (typeof window !== "undefined" && isLocalDevelopmentHost(window.location.hostname)) {
    return Promise.resolve({
      user: LOCAL_DEMO_USER,
      session: { id: "local-demo-session", expiresAt: "2099-01-01T00:00:00.000Z" },
    } satisfies BetterAuthSession);
  }
  return request("/get-session") as Promise<BetterAuthSession>;
}
/**
 * Reads the session, retrying a failed read (network blip, slow auth host, 5xx) before giving up.
 * A signed-out customer gets a normal `null` response, so only real failures are retried; this keeps a
 * momentary hiccup from looking like a logout.
 */
export async function getBetterAuthSessionWithRetry(retries = 2, delayMs = 700) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getBetterAuthSession();
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
}
export function signInEmail(email: string, password: string) {
  return request("/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
}
export function signUpEmail(name: string, email: string, password: string) {
  return request("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}
export async function signInGoogle(callbackURL = `${window.location.origin}/profile`) {
  const response = await fetch(`${AUTH_BASE}/sign-in/social`, {
    method: "POST",
    redirect: "manual",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "google", callbackURL }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.url)
    throw new Error(payload?.message || "Google Auth belum tersedia");
  window.location.assign(payload.url);
}
export function signOutBetterAuth() {
  return request("/sign-out", { method: "POST", body: JSON.stringify({}) });
}
