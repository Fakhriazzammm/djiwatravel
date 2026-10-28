type BetterAuthSession = { user?: { id?: string; email?: string | null } | null } | null;

export type AuthenticatedUser = { id: string; email: string };

export async function authenticateCustomerCookie(cookie: string): Promise<AuthenticatedUser> {
  if (!cookie) throw new Error("Autentikasi diperlukan");
  let response: Response;
  try {
    response = await fetch("https://api.djiwatentram.web.id/api/auth/get-session", {
      headers: { cookie, origin: "https://djiwatravel.com" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error("Autentikasi diperlukan");
  }
  if (!response.ok) throw new Error("Autentikasi diperlukan");
  const session = (await response.json()) as BetterAuthSession;
  const user = session?.user;
  if (!user?.email || typeof user.id !== "string") throw new Error("Autentikasi diperlukan");
  return { id: user.id, email: user.email };
}
