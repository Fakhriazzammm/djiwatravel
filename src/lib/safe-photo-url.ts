/** Only https photos are drawn; anything else (data:, javascript:, http:) falls back to initials. */
export function safePhotoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
