/**
 * WhatsApp number normalisation.
 *
 * Indonesian customers type the local form (0812…); the rest of the stack stores and sends to
 * the international form (62812…). The checkout form, the profile form and the server schema
 * all use these helpers, so the rule can never drift between client and server.
 */
export const WHATSAPP_PATTERN = /^62\d{7,13}$/;

/** Strips separators (spaces, dashes, dots, parens) and converts 0… / 8… into 62…. */
export function normalizeWhatsapp(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.replace(/^0+/, "")}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

export function isValidWhatsapp(input: string): boolean {
  return WHATSAPP_PATTERN.test(normalizeWhatsapp(input));
}

/** Human-friendly display form: 6281234567890 -> +62 812-3456-7890 */
export function formatWhatsapp(input: string): string {
  const digits = normalizeWhatsapp(input);
  if (!digits.startsWith("62") || digits.length < 5) return digits;
  const rest = digits.slice(2);
  const groups = [rest.slice(0, 3), rest.slice(3, 7), rest.slice(7, 11)].filter(Boolean);
  return `+62 ${groups.join("-")}`;
}
