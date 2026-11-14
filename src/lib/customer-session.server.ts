import { isLocalDevelopmentHost, LOCAL_DEMO_USER } from "./local-development";

type BetterAuthSession = { user?: { id?: string; email?: string | null } | null } | null;

export type AuthenticatedUser = { id: string; email: string };

/** A failed auth-service read is not evidence that the customer is signed out. */
export class CustomerSessionUnavailableError extends Error {
  constructor() {
    super("Autentikasi diperlukan");
    this.name = "CustomerSessionUnavailableError";
  }
}

export async function authenticateCustomerRequest(request: Request): Promise<AuthenticatedUser> {
  const hostname = new URL(request.url).hostname;
  if (isLocalDevelopmentHost(hostname)) return LOCAL_DEMO_USER;
  return authenticateCustomerCookie(request.headers.get("cookie") ?? "");
}

export async function authenticateCustomerCookie(cookie: string): Promise<AuthenticatedUser> {
  if (!cookie) throw new Error("Autentikasi diperlukan");
  let response: Response;
  try {
    response = await fetch("https://api.djiwatentram.web.id/api/auth/get-session", {
      headers: { cookie, origin: "https://djiwatravel.com" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new CustomerSessionUnavailableError();
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Autentikasi diperlukan");
    }
    throw new CustomerSessionUnavailableError();
  }
  let session: BetterAuthSession;
  try {
    session = (await response.json()) as BetterAuthSession;
  } catch {
    throw new CustomerSessionUnavailableError();
  }
  const user = session?.user;
  if (!user?.email || typeof user.id !== "string") throw new Error("Autentikasi diperlukan");
  return { id: user.id, email: user.email };
}
