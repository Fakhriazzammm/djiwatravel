import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BedDouble,
  CalendarDays,
  Check,
  Coffee,
  Compass,
  Copy,
  Download,
  MapPin,
  Plane,
  ShieldCheck,
  Ticket,
  Utensils,
} from "lucide-react";
import { SiFacebook, SiInstagram, SiTelegram, SiWhatsapp, SiX } from "react-icons/si";
import { toast } from "sonner";
import logoUrl from "@/assets/logo.png";
import { isAllowedImageUrl } from "@/lib/place-image";
import { renderShareCard } from "@/lib/share-card";
import { Page, Wordmark } from "@/components/shell";
import { getSharedTrip } from "@/lib/my-trips.fn";

export const Route = createFileRoute("/share/$token")({
  loader: async ({ params }) => {
    try {
      return await getSharedTrip({ data: { token: params.token } });
    } catch {
      return null;
    }
  },
  head: () => ({
    meta: [
      { title: "Itinerary dibagikan — Djiwa Travel" },
      { name: "description", content: "Itinerary perjalanan yang dibagikan lewat Djiwa Travel." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SharedItinerary,
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
    .filter((item) => dateKey(item.activity_date))
    .sort((a, b) =>
      `${dateKey(a.activity_date)}T${String(a.start_time ?? "99:99")}`.localeCompare(
        `${dateKey(b.activity_date)}T${String(b.start_time ?? "99:99")}`,
      ),
    )
    .forEach((item) => {
      const date = dateKey(item.activity_date);
      groups.set(date, [...(groups.get(date) ?? []), item]);
    });
  return [...groups.entries()].map(([date, dayItems]) => ({ date, items: dayItems }));
}

function SharedItinerary() {
  const data = Route.useLoaderData();

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
  const owner = (data as { owner?: { firstName: string | null } }).owner?.firstName ?? null;
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
          <Wordmark className="h-7" />
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="size-3" /> Baca-saja
          </span>
        </div>
        <div className="relative mt-3 overflow-hidden rounded-2xl bg-foreground text-background">
          {cover && (
            <img
              src={cover}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-55"
              loading="eager"
            />
          )}
          <div className="relative bg-gradient-to-t from-foreground/90 via-foreground/40 to-transparent px-3.5 pb-3 pt-14">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-red">
              Itinerary dibagikan
            </p>
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
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
          {owner ? (
            <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-red text-[11px] font-bold text-white">
                {owner.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">
                Disusun oleh <b className="font-semibold text-foreground">{owner}</b>
              </span>
            </p>
          ) : (
            <span />
          )}
          <p className="shrink-0 text-muted-foreground">
            <b className="font-semibold text-foreground">{days.length}</b> hari ·{" "}
            <b className="font-semibold text-foreground">{activityCount}</b> aktivitas
          </p>
        </div>
      </header>

      <ShareBar
        title={trip.name}
        destination={trip.destination_name}
        dates={dateRange}
        owner={owner}
        days={days.length}
        activities={activityCount}
        items={allItems}
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
                  {day.items.map((item) => {
                    const img = imageOf(item);
                    const Icon = iconFor(item);
                    const time = String(item.start_time ?? "").slice(0, 5);
                    const end = String(item.end_time ?? "").slice(0, 5);
                    return (
                      <article key={item.id} className="flex items-start gap-2.5 py-2">
                        <div className="size-11 shrink-0 overflow-hidden rounded-xl bg-secondary">
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
                            {time && (
                              <span className="font-semibold tabular-nums text-brand-red">
                                {time}
                                {end ? `–${end}` : ""}
                              </span>
                            )}
                            {item.location && (
                              <span className="inline-flex min-w-0 items-center gap-0.5">
                                <MapPin className="size-3 shrink-0" />
                                <span className="truncate">{item.location}</span>
                              </span>
                            )}
                          </p>
                          {item.notes && (
                            <p className="mt-1 line-clamp-3 whitespace-pre-line text-[12px] leading-[1.35] text-muted-foreground">
                              {item.notes}
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
  owner,
  days,
  activities,
  items,
}: {
  title: string;
  destination: string;
  dates: string;
  owner: string | null;
  days: number;
  activities: number;
  items: SharedItem[];
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = () => window.location.href;
  const text = `Itinerary ${title} ke ${destination} (${dates})`;

  async function makeImage() {
    const blob = await renderShareCard({
      title,
      destination,
      dates,
      owner,
      days,
      activities,
      logoUrl,
      highlights: items.slice(0, 6).map((item) => ({
        time: String(item.start_time ?? "").slice(0, 5),
        title: item.title || "Aktivitas",
        place: item.location ?? "",
        image: isAllowedImageUrl(item.place_image_url) ? item.place_image_url : null,
      })),
    });
    return new File([blob], `itinerary-${title.replace(/\W+/g, "-").toLowerCase()}.png`, {
      type: "image/png",
    });
  }

  function download(file: File) {
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  }

  async function shareImage(save: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const file = await makeImage();
      if (!save && navigator.canShare?.({ files: [file] })) {
        try {
          // The system sheet lists Instagram Stories, WhatsApp Status, and other installed apps.
          await navigator.share({ files: [file], text, url: url() });
          return;
        } catch (cause) {
          if ((cause as Error).name === "AbortError") return;
        }
      }
      download(file);
      toast.success(save ? "Gambar disimpan" : "Gambar disimpan. Unggah ke Instagram Story.");
    } catch {
      toast.error("Gambar belum dapat dibuat. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      toast.success("Tautan disalin");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Tautan belum dapat disalin.");
    }
  }

  const open = (href: string) => window.open(href, "_blank", "noopener,noreferrer");
  const enc = encodeURIComponent;
  const tile = "grid size-9 place-items-center rounded-full text-white";
  const item =
    "tap flex flex-col items-center gap-1 rounded-xl py-1 text-[10px] font-medium text-muted-foreground disabled:opacity-60";

  return (
    <section
      className="mt-3 rounded-2xl bg-surface p-3 ring-1 ring-border/60"
      aria-label="Bagikan itinerary"
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => shareImage(false)}
        className="tap flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(45deg,#f9a03a,#e1306c_55%,#7a3fd0)] text-[14px] font-semibold text-white disabled:opacity-60"
      >
        <SiInstagram className="size-4" />
        {busy ? "Membuat gambar…" : "Bagikan ke Instagram Story"}
      </button>
      <div className="mt-2.5 grid grid-cols-6 gap-1">
        <button
          type="button"
          className={item}
          onClick={() => open(`https://wa.me/?text=${enc(`${text}\n${url()}`)}`)}
        >
          <span className={`${tile} bg-[#25d366]`}>
            <SiWhatsapp className="size-[18px]" />
          </span>
          WhatsApp
        </button>
        <button
          type="button"
          className={item}
          onClick={() => open(`https://t.me/share/url?url=${enc(url())}&text=${enc(text)}`)}
        >
          <span className={`${tile} bg-[#27a7e7]`}>
            <SiTelegram className="size-[18px]" />
          </span>
          Telegram
        </button>
        <button
          type="button"
          className={item}
          onClick={() =>
            open(`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url())}`)
          }
        >
          <span className={`${tile} bg-black`}>
            <SiX className="size-4" />
          </span>
          X
        </button>
        <button
          type="button"
          className={item}
          onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${enc(url())}`)}
        >
          <span className={`${tile} bg-[#1877f2]`}>
            <SiFacebook className="size-[18px]" />
          </span>
          Facebook
        </button>
        <button type="button" className={item} disabled={busy} onClick={() => shareImage(true)}>
          <span className={`${tile} bg-secondary text-foreground`}>
            <Download className="size-4" />
          </span>
          Gambar
        </button>
        <button type="button" className={item} onClick={copy}>
          <span className={`${tile} bg-secondary text-foreground`}>
            {copied ? <Check className="size-4 text-[#1fa855]" /> : <Copy className="size-4" />}
          </span>
          Salin
        </button>
      </div>
    </section>
  );
}
