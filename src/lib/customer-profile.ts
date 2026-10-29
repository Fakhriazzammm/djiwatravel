import { normalizeWhatsapp, WHATSAPP_PATTERN } from "./phone";

export type CustomerProfileDraft = {
  email: string;
  whatsapp: string;
  displayName?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  gender?: CustomerProfileGender | null;
};

export type CustomerProfileErrors = Partial<Record<keyof CustomerProfileDraft, string>>;
export const CUSTOMER_PROFILE_GENDERS = ["female", "male", "unspecified"] as const;
export type CustomerProfileGender = (typeof CUSTOMER_PROFILE_GENDERS)[number];

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
  if (draft.displayName && draft.displayName.trim().length > 120) {
    errors.displayName = "Nama terlalu panjang.";
  }
  if (draft.nationality && draft.nationality.trim().length > 80) {
    errors.nationality = "Kewarganegaraan terlalu panjang.";
  }
  if (draft.dateOfBirth) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.dateOfBirth);
    const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
    const validCalendarDate =
      date &&
      date.getFullYear() === Number(match?.[1]) &&
      date.getMonth() === Number(match?.[2]) - 1 &&
      date.getDate() === Number(match?.[3]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!validCalendarDate || !date || date >= today) {
      errors.dateOfBirth = "Tanggal lahir harus sudah lewat.";
    }
  }
  if (draft.gender && !CUSTOMER_PROFILE_GENDERS.includes(draft.gender)) {
    errors.gender = "Pilih jenis kelamin yang tersedia.";
  }
  return errors;
}

/** The draft as it should be stored: trimmed, WhatsApp in international form (62…). */
export function normalizeCustomerProfile(draft: CustomerProfileDraft): CustomerProfileDraft {
  return {
    email: draft.email.trim(),
    whatsapp: normalizeWhatsapp(draft.whatsapp),
    displayName: draft.displayName?.trim() || null,
    nationality: draft.nationality?.trim() || null,
    dateOfBirth: draft.dateOfBirth?.trim() || null,
    gender: draft.gender || null,
  };
}

export function isCustomerProfileComplete(draft: CustomerProfileDraft) {
  return Object.keys(validateCustomerProfile(draft)).length === 0;
}
