import logoUrl from "@/assets/logo.png";
import { getSharedTrip } from "@/lib/my-trips.fn";
import { isAllowedImageUrl } from "@/lib/place-image";
import { renderShareCard } from "@/lib/share-card";

const day = (value: unknown) => String(value ?? "").slice(0, 10);
const label = (value: unknown) => {
  const key = day(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(key)
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long" }).format(
        new Date(`${key}T12:00:00`),
      )
    : "Tanggal belum diatur";
};

/** Story image of a trip's public itinerary, built from the same read model the share page uses. */
export async function tripStoryImage(token: string, link: string): Promise<File> {
  const data = await getSharedTrip({ data: { token } });
  if (!data) throw new Error("share unavailable");
  const trip = data.trip as unknown as {
    name: string;
    destination_name: string;
    departure_date: string | null;
    return_date: string | null;
  };
  const items = [...(data.itinerary as Record<string, unknown>[])]
    .filter((item) => day(item["activity_date"]))
    .sort((a, b) =>
      `${day(a["activity_date"])}${String(a["start_time"] ?? "99:99")}`.localeCompare(
        `${day(b["activity_date"])}${String(b["start_time"] ?? "99:99")}`,
      ),
    );
  const owner = (data as { owner?: { firstName: string | null } }).owner?.firstName ?? null;
  const blob = await renderShareCard({
    title: trip.name,
    destination: trip.destination_name,
    dates: `${label(trip.departure_date)} — ${label(trip.return_date)}`,
    owner,
    link: link.replace(/^https?:\/\//, ""),
    days: new Set(items.map((item) => day(item["activity_date"]))).size,
    activities: items.length,
    logoUrl,
    highlights: items.slice(0, 6).map((item) => ({
      time: String(item["start_time"] ?? "").slice(0, 5),
      title: String(item["title"] ?? "") || "Aktivitas",
      place: String(item["location"] ?? ""),
      image: isAllowedImageUrl(item["place_image_url"])
        ? (item["place_image_url"] as string)
        : null,
    })),
  });
  return new File([blob], `itinerary-${trip.name.replace(/\W+/g, "-").toLowerCase()}.png`, {
    type: "image/png",
  });
}
