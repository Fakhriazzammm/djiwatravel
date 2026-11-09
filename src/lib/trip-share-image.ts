import logoUrl from "@/assets/logo.png";
import { getSharedTrip } from "@/lib/my-trips.fn";
import { isAllowedImageUrl } from "@/lib/place-image";
import { prepareShareCardActivities, renderShareCard } from "@/lib/share-card";

function dateLabel(value: unknown, options?: Intl.DateTimeFormatOptions) {
  const key = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "Tanggal belum diatur";
  return new Intl.DateTimeFormat(
    "id-ID",
    options ?? { day: "numeric", month: "long", year: "numeric" },
  ).format(new Date(`${key}T12:00:00`));
}

function fileSlug(value: string) {
  return value.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "perjalanan";
}

/** Refresh the token-scoped public itinerary on every export, including exports from AI and public pages. */
export async function tripStoryImages(token: string, link: string): Promise<File[]> {
  const data = await getSharedTrip({ data: { token } });
  if (!data) throw new Error("share unavailable");
  const trip = data.trip as unknown as {
    name: string;
    destination_name: string;
    departure_date: string | null;
    return_date: string | null;
    travelers_count: number;
  };
  const owner = (data as { owner?: { firstName: string | null } }).owner?.firstName ?? null;
  const sources = (data.itinerary as Record<string, unknown>[]).map((item) => ({
    activity_date: item["activity_date"] as string | null,
    start_time: item["start_time"] as string | null,
    end_time: item["end_time"] as string | null,
    title: item["title"] as string | null,
    location: item["location"] as string | null,
    notes: item["notes"] as string | null,
    activity_category: item["activity_category"] as string | null,
    image: isAllowedImageUrl(item["place_image_url"]) ? (item["place_image_url"] as string) : null,
  }));
  const highlights = prepareShareCardActivities(sources, (date) =>
    dateLabel(date, { weekday: "long", day: "numeric", month: "short" }),
  );
  const blobs = await renderShareCard({
    title: trip.name,
    destination: trip.destination_name,
    dates: `${dateLabel(trip.departure_date)} — ${dateLabel(trip.return_date)}`,
    owner,
    travelers: trip.travelers_count,
    link: link.replace(/^https?:\/\//, ""),
    days: new Set(
      highlights
        .filter((item) => item.dayLabel !== "Tanggal belum diatur")
        .map((item) => item.dayNumber),
    ).size,
    activities: highlights.length,
    logoUrl,
    highlights,
  });
  const slug = fileSlug(trip.name);
  return blobs.map(
    (blob, index) =>
      new File([blob], `itinerary-${slug}-story-${index + 1}.png`, { type: "image/png" }),
  );
}
