import { getCustomerProfile, upsertCustomerProfile } from "./customer-profile.server";
import type { CustomerProfileDraft } from "./customer-profile";

/**
 * Client wrapper around the authenticated customer-profile server functions.
 * The Better Auth session is read server-side from the HttpOnly cookie, so the
 * browser never supplies the profile identity.
 */
export async function loadCustomerProfile(): Promise<CustomerProfileDraft | null> {
  const profile = await getCustomerProfile({ data: undefined });
  return profile ?? null;
}

export async function saveCustomerProfile(draft: CustomerProfileDraft): Promise<CustomerProfileDraft> {
  const saved = await upsertCustomerProfile({ data: draft });
  if (!saved) throw new Error("Data profil belum tersimpan. Coba lagi.");
  return saved;
}
