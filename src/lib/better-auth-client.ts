import { createAuthClient } from "better-auth/react";

const CANONICAL_AUTH_BASE = "https://auth.zantara.id/api/auth";
const AUTH_BASE = typeof window === "undefined"
  ? (import.meta.env.VITE_BETTER_AUTH_URL || CANONICAL_AUTH_BASE).replace(/\/$/, "")
  : "/api/auth";

export type BetterAuthUser = { id: string; name?: string | null; email?: string | null };
export type BetterAuthSession = { user: BetterAuthUser; session: { id: string; expiresAt: string } } | null;

export const authClient = createAuthClient({
  baseURL: AUTH_BASE,
  fetchOptions: {
    credentials: "include",
  },
});

function authError(error: { message?: string; status?: number; statusText?: string; code?: string } | null | undefined) {
  if (!error) return null;
  const message = error.message || error.statusText || "Permintaan autentikasi gagal";
  const result = new Error(message) as Error & { code?: string; status?: number };
  result.code = error.code;
  result.status = error.status;
  return result;
}

export async function getBetterAuthSession() {
  const result = await authClient.getSession();
  const error = authError(result.error);
  if (error) throw error;
  return result.data as BetterAuthSession;
}

export async function signInEmail(email: string, password: string) {
  const result = await authClient.signIn.email({ email, password });
  const error = authError(result.error);
  if (error) throw error;
  return result.data;
}

export async function signUpEmail(name: string, email: string, password: string) {
  const result = await authClient.signUp.email({ name, email, password });
  const error = authError(result.error);
  if (error) throw error;
  return result.data;
}

export async function signInGoogle(callbackURL: string) {
  const result = await authClient.signIn.social({
    provider: "google",
    callbackURL,
  });
  const error = authError(result.error);
  if (error) throw error;
  if (result.data?.url && typeof window !== "undefined") {
    window.location.assign(result.data.url);
  }
  return result.data;
}

export async function signOutBetterAuth() {
  const result = await authClient.signOut();
  const error = authError(result.error);
  if (error) throw error;
  return result.data;
}
