export async function resolveOptionalCustomerSession<T>(
  cookieHeader: string,
  verifySession: (cookie: string) => Promise<T>,
): Promise<T | null> {
  const hasSessionCookie = cookieHeader.split(";").some((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return false;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return /session/i.test(name) && value.length > 0;
  });

  if (!hasSessionCookie) return null;
  return verifySession(cookieHeader);
}
