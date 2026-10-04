import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

type SessionClaims = { sub: string; email?: string; iat: number; exp: number; nonce: string };

function secret() {
  const value = process.env.CUSTOMER_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("CUSTOMER_AUTH_SECRET harus dikonfigurasi minimal 32 karakter");
  return value;
}
function b64(value: string) { return Buffer.from(value).toString("base64url"); }
function sign(body: string) { return createHmac("sha256", secret()).update(body).digest("base64url"); }

/** Stateless, short-lived My eSIM session. No password or eSIM secret is stored in the token. */
export function issueCustomerSession(input: { customerId: string; email?: string; ttlSeconds?: number }) {
  if (!input.customerId) throw new Error("customerId wajib diisi");
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = { sub: input.customerId, email: input.email, iat: now, exp: now + Math.min(input.ttlSeconds ?? 900, 3600), nonce: randomBytes(16).toString("hex") };
  const body = b64(JSON.stringify(claims));
  return `${body}.${sign(body)}`;
}

export function verifyCustomerSession(token: string, now = Math.floor(Date.now() / 1000)) {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Session customer tidak valid");
  const expected = sign(body);
  if (!/^[A-Za-z0-9_-]+$/.test(signature) || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error("Signature session customer tidak valid");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionClaims;
  if (!claims.sub || !claims.nonce || !Number.isInteger(claims.exp) || claims.exp <= now) throw new Error("Session customer sudah kedaluwarsa");
  return claims;
}
