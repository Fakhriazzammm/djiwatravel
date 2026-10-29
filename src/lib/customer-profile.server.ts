import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { customerProfiles } from "../../drizzle/schema";
import { db } from "../db/client.server";
import { getAuthenticatedUser } from "./customer-session.fn";
import type { AuthenticatedUser } from "./customer-session.server";
import {
  CUSTOMER_PROFILE_GENDERS,
  normalizeCustomerProfile,
  validateCustomerProfile,
} from "./customer-profile";

export const customerProfileInputSchema = z
  .object({
    email: z.string().trim().email().max(254),
    whatsapp: z
      .string()
      .trim()
      .regex(/^62\d{7,13}$/, "Nomor WhatsApp harus diawali 62"),
    displayName: z.string().trim().max(120).nullable().optional(),
    nationality: z.string().trim().max(80).nullable().optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    gender: z.enum(CUSTOMER_PROFILE_GENDERS).nullable().optional(),
  })
  .superRefine((value, context) => {
    const errors = validateCustomerProfile(value);
    for (const [path, message] of Object.entries(errors)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    }
  });

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

export async function requireBetterAuthUser(cookie?: string): Promise<AuthenticatedUser> {
  if (cookie !== undefined) {
    const { authenticateCustomerCookie } = await import("./customer-session.server");
    return authenticateCustomerCookie(cookie);
  }
  return getAuthenticatedUser();
}

/** Resolve the canonical wallet identity without exposing the session cookie. */
export async function resolveCanonicalCustomerIdentity(
  authenticatedEmail: string,
  cookie: string,
): Promise<CanonicalCustomerIdentity> {
  return (await import("./customer-identity.server")).resolveCanonicalCustomerIdentity(
    authenticatedEmail,
    cookie,
  );
}

/** Backwards-compatible source-id helper for callers that do not send email. */
export async function resolveCanonicalCustomerSourceId(
  authenticatedEmail: string,
  cookie: string,
): Promise<string> {
  return (await resolveCanonicalCustomerIdentity(authenticatedEmail, cookie)).sourceId;
}

export async function readCustomerProfile(user: AuthenticatedUser) {
  const rows = await db
    .select({
      email: customerProfiles.email,
      whatsapp: customerProfiles.whatsapp,
      displayName: customerProfiles.displayName,
      nationality: customerProfiles.nationality,
      dateOfBirth: customerProfiles.dateOfBirth,
      gender: customerProfiles.gender,
    })
    .from(customerProfiles)
    .where(eq(customerProfiles.authUserId, user.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function writeCustomerProfile(
  user: AuthenticatedUser,
  data: z.infer<typeof customerProfileInputSchema>,
) {
  if (data.email.toLowerCase() !== user.email.toLowerCase())
    throw new Error("Email profil harus sama dengan email akun");
  const normalized = normalizeCustomerProfile(data);
  const whatsapp = normalizeCustomerWhatsapp(normalized.whatsapp);
  const values = {
    authUserId: user.id,
    email: user.email.toLowerCase(),
    whatsapp,
    displayName: normalized.displayName,
    nationality: normalized.nationality,
    dateOfBirth: normalized.dateOfBirth,
    gender: normalized.gender,
  };
  const [profile] = await db
    .insert(customerProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: customerProfiles.authUserId,
      set: {
        email: values.email,
        whatsapp,
        displayName: values.displayName,
        nationality: values.nationality,
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        updatedAt: new Date().toISOString(),
      },
    })
    .returning({
      email: customerProfiles.email,
      whatsapp: customerProfiles.whatsapp,
      displayName: customerProfiles.displayName,
      nationality: customerProfiles.nationality,
      dateOfBirth: customerProfiles.dateOfBirth,
      gender: customerProfiles.gender,
    });
  return profile;
}

export const getCustomerProfile = createServerFn({ method: "GET" }).handler(async () => {
  return readCustomerProfile(await getAuthenticatedUser());
});

export const upsertCustomerProfile = createServerFn({ method: "POST" })
  .validator(customerProfileInputSchema)
  .handler(async ({ data }) => {
    return writeCustomerProfile(await getAuthenticatedUser(), data);
  });

export const customerProfileContract = {
  read: "GET server function; derives Better Auth user from the HttpOnly session cookie",
  upsert:
    "POST { email, whatsapp, displayName?, nationality?, dateOfBirth?, gender? }; email must equal the authenticated Better Auth email",
  response:
    "{ email, whatsapp, displayName, nationality, dateOfBirth, gender } | null; guest checkout and Mayar settlement remain unchanged",
} as const;
