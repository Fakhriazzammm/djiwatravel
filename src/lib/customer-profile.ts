import { normalizeWhatsapp, WHATSAPP_PATTERN } from "./phone";

export type CustomerProfileDraft = {
  email: string;
  whatsapp: string;
};

export type CustomerProfileErrors = Partial<Record<keyof CustomerProfileDraft, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Format-only checks; ownership and uniqueness stay server-side. */
export function validateCustomerProfile(draft: CustomerProfileDraft): CustomerProfileErrors {
  const errors: CustomerProfileErrors = {};
  const email = draft.email.trim();
  const whatsapp = normalizeWhatsapp(draft.whatsapp);
  if (!EMAIL_PATTERN.test(email)) errors.email = "Masukkan email yang valid.";
  if (!WHATSAPP_PATTERN.test(whatsapp)) {
    errors.whatsapp = "Nomor WhatsApp belum valid. Contoh: 08123456789.";
  }
  return errors;
}

/** The draft as it should be stored: trimmed, WhatsApp in international form (62…). */
export function normalizeCustomerProfile(draft: CustomerProfileDraft): CustomerProfileDraft {
  return { email: draft.email.trim(), whatsapp: normalizeWhatsapp(draft.whatsapp) };
}

export function isCustomerProfileComplete(draft: CustomerProfileDraft) {
  return Object.keys(validateCustomerProfile(draft)).length === 0;
}
