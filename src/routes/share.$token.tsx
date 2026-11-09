import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BedDouble,
  CalendarDays,
  Coffee,
  Compass,
  MapPin,
  Plane,
  ShieldCheck,
  Ticket,
  Utensils,
} from "lucide-react";
import { SocialShare } from "@/components/social-share";
import { isAllowedImageUrl } from "@/lib/place-image";
import { splitActivityNotes } from "@/lib/share-card";
import { tripStoryImages } from "@/lib/trip-share-image";
import { Page, Wordmark } from "@/components/shell";
import { getSharedTrip } from "@/lib/my-trips.fn";

export const loadShared = async ({ params }: { params: { token: string } }) => {
  try {
    return await getSharedTrip({ data: { token: params.token } });
  } catch {
    return null;
  }
};

export const sharedHead = () => ({
  meta: [
    { title: "Itinerary dibagikan — Djiwa Travel" },
    { name: "description", content: "Itinerary perjalanan yang dibagikan lewat Djiwa Travel." },
    { name: "robots", content: "noindex, nofollow" },
  ],
});

export const Route = createFileRoute("/share/$token")({
  loader: loadShared,
  head: sharedHead,
  component: SharedRoute,
});

type SharedData = NonNullable<Awaited<ReturnType<typeof getSharedTrip>>>;
type SharedTrip = SharedData["trip"] & {
  name: string;
  destination_name: string;
  departure_date: string | null;
  return_date: string | null;
  travelers_count: number;
};
type SharedItem = {
  id: string;
  activity_date?: string | Date | null;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
  activity_category?: string | null;
  place_image_url?: string | null;
};

const dateKey = (value?: string | Date | null) => {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
};

const formatDate = (value?: string | Date | null, options?: Intl.DateTimeFormatOptions) => {
  const key = dateKey(value);
  if (!key) return "Tanggal belum diatur";
  return new Intl.DateTimeFormat("id-ID", options ?? { day: "numeric", month: "long" }).format(
    new Date(`${key}T12:00:00`),
  );
};

function groupByDay(items: SharedItem[]) {
  const groups = new Map<string, SharedItem[]>();
  [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aDate = dateKey(a.item.activity_date) || "9999-99-99";
      const bDate = dateKey(b.item.activity_date) || "9999-99-99";
      const byDate = aDate.localeCompare(bDate);
      if (byDate) return byDate;
      const aTime = String(a.item.start_time ?? "").slice(0, 5) || "99:99";
      const bTime = String(b.item.start_time ?? "").slice(0, 5) || "99:99";
      return aTime.localeCompare(bTime) || a.index - b.index;
    })
    .forEach((item) => {
      const date = dateKey(item.item.activity_date);
      groups.set(date, [...(groups.get(date) ?? []), item.item]);
    });
  return [...groups.entries()].map(([date, dayItems]) => ({ date, items: dayItems }));
}

type LoaderData = Awaited<ReturnType<typeof loadShared>>;

export function SharedItinerary({ data }: { data: LoaderData }) {
  if (!data) {
    return (
      <Page tabs={false}>
        <div className="flex min-h-[70vh] items-center justify-center">
          <section className="w-full rounded-[22px] bg-surface px-4 py-10 text-center ring-1 ring-border/60">
            <Compass className="mx-auto size-8 text-muted-foreground" strokeWidth={1.4} />
            <h1 className="mt-4 text-[22px] font-bold">Tautan tidak tersedia</h1>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
              Tautan itinerary ini tidak ditemukan atau sudah dicabut oleh pemilik perjalanan.
            </p>
            <Link
              to="/"
              className="tap mx-auto mt-4 flex h-11 max-w-xs items-center justify-center rounded-xl bg-brand-red text-sm font-semibold text-white"
            >
              Ke Beranda
            </Link>
          </section>
        </div>
      </Page>
    );
  }

  const trip = data.trip as unknown as SharedTrip;
  const ownerInfo = (data as { owner?: { firstName: string | null; handle?: string } }).owner;
  const owner = ownerInfo?.firstName ?? null;
  const handle = ownerInfo?.handle ?? "member";
  const token = String((data.trip as { token?: string }).token ?? "");
  const days = groupByDay(data.itinerary as SharedItem[]);
  const activityCount = days.reduce((sum, day) => sum + day.items.length, 0);
  const imageOf = (item: SharedItem) =>
    isAllowedImageUrl(item.place_image_url) ? item.place_image_url : null;
  const allItems = days.flatMap((day) => day.items);
  const cover = allItems.map(imageOf).find(Boolean) ?? null;
  const dateRange = `${formatDate(trip.departure_date)} — ${formatDate(trip.return_date)}`;

  return (
    <Page tabs={false}>
      <header className="pt-3">
        <div className="flex items-center justify-between gap-3">
          <Wordmark className="h-10" />
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="size-3" /> Baca-saja
          </span>
        </div>
        <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-brand-red">
          Itinerary dibagikan
        </p>
        <div className="relative mt-1.5 overflow-hidden rounded-2xl bg-foreground text-background">
          {cover && (
            <img
              src={cover}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-55"
              loading="eager"
            />
          )}
          <div className="relative bg-gradient-to-t from-foreground/90 via-foreground/40 to-transparent px-3.5 pb-3 pt-14">
            <h1 className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight">
              {trip.name}
            </h1>
            <p className="mt-1 flex items-center gap-1 text-[13px] text-background/80">
              <MapPin className="size-3.5" />
              {trip.destination_name}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-background/70">
              <CalendarDays className="size-3.5" />
              {dateRange} · {trip.travelers_count} traveler
            </p>
            <p className="mt-0.5 text-[12px] text-background/70">
              {days.length} hari · {activityCount} aktivitas
            </p>
          </div>
        </div>
        {owner && (
          <p className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-red text-[11px] font-bold text-white">
              {owner.slice(0, 1).toUpperCase()}
            </span>
            <b className="truncate font-semibold text-foreground">{owner}</b>
            <span className="shrink-0 rounded-full bg-brand-red/10 px-2 py-0.5 text-[10px] font-semibold text-brand-red">
              Member Djiwa Travel
            </span>
          </p>
        )}
      </header>

      <ShareBar
        title={trip.name}
        destination={trip.destination_name}
        dates={dateRange}
        handle={handle}
        token={token}
      />

      <section className="mt-3" aria-labelledby="shared-itinerary-heading">
        <h2
          id="shared-itinerary-heading"
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Rencana perjalanan
        </h2>
        {days.length ? (
          <div className="mt-2 space-y-2.5">
            {days.map((day, index) => (
              <section key={day.date} className="rounded-2xl bg-surface p-3 ring-1 ring-border/60">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight">
                    <span className="grid size-6 place-items-center rounded-md bg-brand-red/10 text-[11px] font-bold text-brand-red">
                      {index + 1}
                    </span>
                    {formatDate(day.date, { weekday: "long", day: "numeric", month: "short" })}
                  </h3>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {day.items.length} aktivitas
                  </span>
                </div>
                <div className="mt-1.5 divide-y divide-border/60">
                  {day.items.map((item, itemIndex) => {
                    const img = imageOf(item);
                    const Icon = iconFor(item);
                    const time = String(item.start_time ?? "").slice(0, 5);
                    const end = String(item.end_time ?? "").slice(0, 5);
                    const notes = splitActivityNotes(item.notes);
                    return (
                      <article key={item.id} className="flex items-start gap-2 py-2">
                        <span
                          aria-label={`Urutan ${itemIndex + 1}`}
                          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-[10px] font-semibold tabular-nums text-muted-foreground"
                        >
                          {String(itemIndex + 1).padStart(2, "0")}
                        </span>
                        <div className="size-10 shrink-0 overflow-hidden rounded-xl bg-secondary">
                          {img ? (
                            <img
                              src={img}
                              alt={item.title ?? ""}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="grid size-full place-items-center text-muted-foreground">
                              <Icon className="size-5" strokeWidth={1.6} />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-[14px] font-semibold leading-snug">
                            {item.title || "Aktivitas"}
                          </h4>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                            <span className="font-semibold tabular-nums text-brand-red">
                              {time || end
                                ? `${time || "Mulai belum diatur"}${end ? `–${end}` : ""}`
                                : "Waktu belum diatur"}
                            </span>
                            <span className="inline-flex min-w-0 items-center gap-0.5">
                              <MapPin className="size-3 shrink-0" />
                              <span className="truncate">
                                Lokasi · {item.location || "Belum dicantumkan"}
                              </span>
                            </span>
                          </p>
                          <p className="mt-1 whitespace-pre-line text-[11px] leading-[1.4] text-muted-foreground">
                            <span className="font-medium text-foreground/75">Keterangan · </span>
                            {notes.details || "Belum ada keterangan tambahan"}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                            <span className="font-medium text-foreground/75">Jam buka · </span>
                            {notes.openingHours || "Belum dicantumkan"}
                            {notes.openingHoursSource && ` · ${notes.openingHoursSource}`}
                          </p>
                          {notes.openingHoursWarning && (
                            <p className="mt-0.5 text-[10px] leading-[1.4] text-brand-red">
                              {notes.openingHoursWarning}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-2 rounded-2xl bg-surface px-4 py-8 text-center ring-1 ring-border/60">
            <Plane className="mx-auto size-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-semibold">Belum ada agenda</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pemilik perjalanan belum menambahkan aktivitas.
            </p>
          </div>
        )}
      </section>

      <footer className="mt-3 rounded-2xl bg-foreground px-3 py-3 text-center text-background">
        <p className="text-[14px] font-semibold">Mau menyusun itinerary seperti ini?</p>
        <p className="mt-0.5 text-[12px] text-background/65">
          Simpan agenda, checklist, dan anggaran perjalananmu di Djiwa Travel.
        </p>
        <Link
          to="/my-trips"
          className="tap mx-auto mt-2.5 flex min-h-10 max-w-xs items-center justify-center rounded-xl bg-background text-[14px] font-semibold text-foreground"
        >
          Mulai di Djiwa Travel
        </Link>
      </footer>
    </Page>
  );
}

function iconFor(item: SharedItem) {
  const value = `${item.activity_category ?? ""} ${item.title ?? ""}`.toLowerCase();
  if (/flight|airport|bandara|penerbangan/.test(value)) return Plane;
  if (/hotel|check-in|check in|accommodation/.test(value)) return BedDouble;
  if (/food|dinner|makan|lunch|ramen/.test(value)) return Utensils;
  if (/ticket|attraction|atraksi/.test(value)) return Ticket;
  if (/coffee|cafe|kopi/.test(value)) return Coffee;
  return MapPin;
}

function ShareBar({
  title,
  destination,
  dates,
  handle,
  token,
}: {
  title: string;
  destination: string;
  dates: string;
  handle: string;
  token: string;
}) {
  const url = `${window.location.origin}/share/${handle}/${token}`;
  const text = `Itinerary ${title} ke ${destination} (${dates})`;

  async function makeImage() {
    return tripStoryImages(token, url);
  }

  return (
    <div className="mt-3">
      <SocialShare url={url} text={text} makeImage={makeImage} label="Bagikan itinerary" />
    </div>
  );
}

function SharedRoute() {
  return <SharedItinerary data={Route.useLoaderData()} />;
}
