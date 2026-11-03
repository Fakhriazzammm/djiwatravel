/** Where a Google Calendar connect started from a trip page returns to. Same-site trip paths only. */
export const CALENDAR_RETURN_COOKIE = "djiwa_cal_return";

export function isSafeCalendarReturn(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 300) return false;
  if (!value.startsWith("/my-trips/") || value.startsWith("//") || value.includes("\\"))
    return false;
  try {
    const url = new URL(value, "https://djiwatravel.com");
    return url.origin === "https://djiwatravel.com" && url.pathname.startsWith("/my-trips/");
  } catch {
    return false;
  }
}

export function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}
