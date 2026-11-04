/**
 * What a traveler is told when a Sheets sync failed. The stored error is a redacted Google message;
 * some causes are ours to fix (the API is not enabled for the app), not the traveler's.
 */
export function friendlySheetError(error: string | null | undefined) {
  const text = String(error ?? "");
  if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(text))
    return "Layanan Google Sheets belum siap di sisi Djiwa. Data kamu aman. Coba lagi nanti.";
  if (/\b(401|invalid_grant)\b|dicabut/i.test(text))
    return "Akses Google perlu dihubungkan ulang. Data kamu aman.";
  if (/\b429\b|quota|rate limit/i.test(text))
    return "Google sedang membatasi permintaan. Akan dicoba lagi otomatis.";
  return "Gagal sinkron. Data kamu aman. Coba lagi.";
}
