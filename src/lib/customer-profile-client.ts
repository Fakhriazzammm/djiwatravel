import type { CustomerProfileDraft } from "./customer-profile";

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
  return request("/api/customer-profile", {
    method: "POST",
    body: JSON.stringify(draft),
  }) as Promise<CustomerProfileDraft>;
}
