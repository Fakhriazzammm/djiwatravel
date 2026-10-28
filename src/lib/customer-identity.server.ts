type CanonicalCustomerProfileResponse = {
  customer?: { source_id?: unknown; email?: unknown } | null;
};

export async function resolveCanonicalCustomerIdentity(authenticatedEmail: string, cookie: string) {
  if (!cookie) throw new Error("Profil customer canonical tidak tersedia");
  let response: Response;
  try {
    response = await fetch("https://api.djiwatentram.web.id/api/customer/profile", {
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
  const sourceId =
    typeof payload?.customer?.source_id === "string" ? payload.customer.source_id.trim() : "";
  const profileEmail =
    typeof payload?.customer?.email === "string" ? payload.customer.email.trim() : "";
  if (
    !sourceId ||
    !profileEmail ||
    profileEmail.toLowerCase() !== authenticatedEmail.trim().toLowerCase()
  ) {
    throw new Error("Profil customer canonical tidak valid");
  }
  return { sourceId, email: profileEmail };
}
