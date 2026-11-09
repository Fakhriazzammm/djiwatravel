import { getBetterAuthSession } from "./better-auth-client";

/** Presentation only: the verified session remains the ownership source on the server. */
export async function shareGeneratorName(): Promise<string> {
  try {
    const session = await getBetterAuthSession();
    if (!session?.user) return "Pengunjung";
    return session.user.name?.trim().split(/\s+/)[0]?.slice(0, 40) || "Member Djiwa Travel";
  } catch {
    // An unavailable session must never be presented as the public itinerary's owner.
    return "Pengunjung";
  }
}

export function shareGenerationTime(now = new Date()): string {
  return `${new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(now)} WIB`;
}
