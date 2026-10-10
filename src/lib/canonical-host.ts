/**
 * The host that customer sessions, OAuth redirect URIs and canonical links are
 * built around.
 *
 * `www.djiwatravel.com` is only an alias: its callback URL is not registered in
 * the Google OAuth client, and forwarding it would make the auth server resolve
 * a different base URL than the one used for the token exchange. Redirecting the
 * alias to the canonical host keeps the whole login flow on a single origin, so
 * the state cookie and the session cookie stay first-party.
 */
export const CANONICAL_HOST = "djiwatravel.com";

/**
 * Returns the canonical absolute URL when `input` was requested on the `www.`
 * alias, otherwise `null` (no redirect needed).
 */
export function canonicalRedirectUrl(input: string | URL): string | null {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : input;
  } catch {
    return null;
  }
  if (url.host.toLowerCase() !== `www.${CANONICAL_HOST}`) return null;
  const target = new URL(url.toString());
  target.protocol = "https:";
  target.host = CANONICAL_HOST;
  return target.toString();
}
