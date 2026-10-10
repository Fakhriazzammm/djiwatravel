import { createHash } from "node:crypto";
import { normalizeWhatsapp, WHATSAPP_PATTERN } from "./phone";

export function hashGuestAccessToken(token: string): string {
  if (token.length < 32 || token.length > 256) throw new Error("Guest access token is invalid");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function normalizeGuestWhatsapp(value: string): string {
  const phone = normalizeWhatsapp(value);
  if (!WHATSAPP_PATTERN.test(phone)) throw new Error("Nomor WhatsApp tidak valid");
  return phone;
}
