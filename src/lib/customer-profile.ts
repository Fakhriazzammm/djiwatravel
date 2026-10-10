export type CustomerProfileDraft = {
  email: string;
  whatsapp: string;
};

export type CustomerProfileErrors = Partial<Record<keyof CustomerProfileDraft, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_PATTERN = /^62\d{7,13}$/;

/** Format-only checks; ownership and uniqueness stay server-side. */
export function validateCustomerProfile(draft: CustomerProfileDraft): CustomerProfileErrors {
  const errors: CustomerProfileErrors = {};
  const email = draft.email.trim();
  const whatsapp = draft.whatsapp.trim();
  if (!EMAIL_PATTERN.test(email)) errors.email = "Masukkan email yang valid.";
  if (!WHATSAPP_PATTERN.test(whatsapp) || whatsapp.replace(/\D/g, "").length < 9) {
    errors.whatsapp = "Masukkan nomor WhatsApp yang valid.";
  }
  return errors;
}

export function isCustomerProfileComplete(draft: CustomerProfileDraft) {
  return Object.keys(validateCustomerProfile(draft)).length === 0;
}


