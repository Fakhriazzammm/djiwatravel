import { createHash } from "node:crypto";

export function hashGuestAccessToken(token: string): string {
  if (token.length < 32 || token.length > 256) throw new Error("Guest access token is invalid");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function normalizeGuestWhatsapp(value: string): string {
  const phone = value.replace(/\D/g, "");
  if (phone.length < 9 || phone.length > 15) throw new Error("Nomor WhatsApp tidak valid");
  return phone;
}
