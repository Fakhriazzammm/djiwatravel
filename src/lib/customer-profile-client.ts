import { normalizeCustomerProfile, type CustomerProfileDraft } from "./customer-profile";

export const CUSTOMER_PROFILE_UPDATED_EVENT = "djiwa:customer-profile-updated";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      payload && typeof payload.error === "string" ? payload.error : "Permintaan profil gagal",
    );
  return payload;
}

export async function loadCustomerProfile(): Promise<CustomerProfileDraft | null> {
  return request("/api/customer-profile") as Promise<CustomerProfileDraft | null>;
}

export async function saveCustomerProfile(
  draft: CustomerProfileDraft,
): Promise<CustomerProfileDraft> {
  const normalized = normalizeCustomerProfile(draft);
  const saved = (await request("/api/customer-profile", {
    method: "POST",
    body: JSON.stringify(normalized),
  })) as CustomerProfileDraft;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CUSTOMER_PROFILE_UPDATED_EVENT, { detail: saved }));
  }
  return saved;
}
