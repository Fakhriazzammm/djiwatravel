import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { customerProfiles } from "../../drizzle/schema";
import { db } from "../db/client.server";

const profileInputSchema = z.object({
  email: z.string().trim().email().max(254),
  whatsapp: z.string().trim().regex(/^62\d{7,13}$/, "Nomor WhatsApp harus diawali 62"),
});

type BetterAuthSession = {
  user?: { id?: string; email?: string | null } | null;
} | null;
export type AuthenticatedUser = { id: string; email: string };

type CanonicalCustomerProfileResponse = {
  customer?: { source_id?: unknown; email?: unknown } | null;
};
export type CanonicalCustomerIdentity = { sourceId: string; email: string };

/**
 * Better Auth issues an opaque text token as the user id (observed: 32
 * alphanumeric characters), not a uuid. Validate the shape instead of assuming
 * a uuid so a real session is never rejected.
 */
export function isBetterAuthUserId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function normalizeCustomerWhatsapp(value: string) {
  const normalized = value.trim();
  if (!/^62\d{7,13}$/.test(normalized)) throw new Error("Nomor WhatsApp harus diawali 62");
  return normalized;
}

export async function requireBetterAuthUser(cookie = getRequestHeader("cookie")): Promise<AuthenticatedUser> {
  if (!cookie) throw new Error("Autentikasi diperlukan");
  const response = await fetch("https://auth.zantara.id/api/auth/get-session", {
    headers: { cookie, origin: "https://djiwatravel.com" },
  });
  if (!response.ok) throw new Error("Autentikasi diperlukan");
  const session = (await response.json()) as BetterAuthSession;
  const user = session?.user;
  if (!user?.email || !isBetterAuthUserId(user.id)) throw new Error("Autentikasi diperlukan");
  return { id: user.id, email: user.email };
}

/** Resolve the canonical wallet identity without exposing the session cookie. */
export async function resolveCanonicalCustomerIdentity(
  authenticatedEmail: string,
  cookie = getRequestHeader("cookie"),
): Promise<CanonicalCustomerIdentity> {
  if (!cookie) throw new Error("Profil customer canonical tidak tersedia");
  let response: Response;
  try {
    response = await fetch("https://auth.zantara.id/api/customer/profile", {
      headers: { cookie, origin: "https://djiwatravel.com", accept: "application/json" },
    });
  } catch {
    throw new Error("Profil customer canonical tidak tersedia");
  }
  if (!response.ok) throw new Error("Profil customer canonical tidak tersedia");

  let payload: CanonicalCustomerProfileResponse | null;
  try {
    payload = (await response.json()) as CanonicalCustomerProfileResponse;
  } catch {
    throw new Error("Profil customer canonical tidak valid");
  }
  const sourceId = typeof payload?.customer?.source_id === "string" ? payload.customer.source_id.trim() : "";
  const profileEmail = typeof payload?.customer?.email === "string" ? payload.customer.email.trim() : "";
  if (!sourceId || !profileEmail || profileEmail.toLowerCase() !== authenticatedEmail.trim().toLowerCase()) {
    throw new Error("Profil customer canonical tidak valid");
  }
  return { sourceId, email: profileEmail };
}

/** Backwards-compatible source-id helper for callers that do not send email. */
export async function resolveCanonicalCustomerSourceId(
  authenticatedEmail: string,
  cookie = getRequestHeader("cookie"),
): Promise<string> {
  return (await resolveCanonicalCustomerIdentity(authenticatedEmail, cookie)).sourceId;
}

export const getCustomerProfile = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireBetterAuthUser();
  const rows = await db
    .select({ email: customerProfiles.email, whatsapp: customerProfiles.whatsapp })
    .from(customerProfiles)
    .where(eq(customerProfiles.authUserId, user.id))
    .limit(1);
  return rows[0] ?? null;
});

export const upsertCustomerProfile = createServerFn({ method: "POST" })
  .validator(profileInputSchema)
  .handler(async ({ data }) => {
    const user = await requireBetterAuthUser();
    if (data.email.toLowerCase() !== user.email.toLowerCase())
      throw new Error("Email profil harus sama dengan email akun");
    const whatsapp = normalizeCustomerWhatsapp(data.whatsapp);
    const values = { authUserId: user.id, email: user.email.toLowerCase(), whatsapp };
    const [profile] = await db
      .insert(customerProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: customerProfiles.authUserId,
        set: { email: values.email, whatsapp, updatedAt: new Date().toISOString() },
      })
      .returning({ email: customerProfiles.email, whatsapp: customerProfiles.whatsapp });
    return profile;
  });

export const customerProfileContract = {
  read: "GET server function; derives Better Auth user from the HttpOnly session cookie",
  upsert: "POST { email, whatsapp }; email must equal the authenticated Better Auth email",
  response: "{ email, whatsapp } | null; guest checkout and Mayar settlement remain unchanged",
} as const;
