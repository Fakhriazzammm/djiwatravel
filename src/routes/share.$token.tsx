import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Clock3, Compass, MapPin, Plane, ShieldCheck } from "lucide-react";
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
          <section className="w-full rounded-[28px] bg-surface px-5 py-10 text-center ring-1 ring-border/60">
            <Compass className="mx-auto size-12 text-muted-foreground" strokeWidth={1.4} />
            <h1 className="mt-4 text-[22px] font-bold">Tautan tidak tersedia</h1>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
              Tautan itinerary ini tidak ditemukan atau sudah dicabut oleh pemilik perjalanan.
            </p>
            <Link
              to="/"
              className="tap mx-auto mt-6 flex h-11 max-w-xs items-center justify-center rounded-xl bg-brand-red text-sm font-semibold text-white"
            >
              Ke Beranda
            </Link>
          </section>
        </div>
      </Page>
    );
  }

  const trip = data.trip as unknown as SharedTrip;
  const days = groupByDay(data.itinerary as SharedItem[]);
  const activityCount = days.reduce((sum, day) => sum + day.items.length, 0);

  return (
    <Page tabs={false}>
      <header className="pt-4">
        <div className="flex items-center justify-between gap-3">
          <Wordmark className="h-8" />
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="size-3" /> Baca-saja
          </span>
        </div>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.14em] text-brand-red">
          Itinerary dibagikan
        </p>
        <h1 className="mt-1.5 text-[32px] font-bold leading-[1.1] tracking-[-0.04em]">
          {trip.name}
        </h1>
        <p className="mt-2 flex items-center gap-1.5 text-[15px] text-muted-foreground">
          <MapPin className="size-4" />
          {trip.destination_name}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <CalendarDays className="size-4" />
          {formatDate(trip.departure_date)} — {formatDate(trip.return_date)} ·{" "}
          {trip.travelers_count} traveler
        </p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-border/60">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hari agenda
          </p>
          <p className="mt-1 text-2xl font-bold">{days.length}</p>
        </div>
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-border/60">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Aktivitas
          </p>
          <p className="mt-1 text-2xl font-bold">{activityCount}</p>
        </div>
      </div>

      <section className="mt-6" aria-labelledby="shared-itinerary-heading">
        <h2 id="shared-itinerary-heading" className="text-[20px] font-bold tracking-[-0.03em]">
          Rencana perjalanan
        </h2>
        {days.length ? (
          <div className="mt-3 space-y-4">
            {days.map((day) => (
              <section key={day.date} className="rounded-[20px] bg-surface px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-semibold tracking-tight">
                    {formatDate(day.date, {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}
                  </h3>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {day.items.length} aktivitas
                  </span>
                </div>
                <div className="mt-2 divide-y divide-border/60">
                  {day.items.map((item) => (
                    <article key={item.id} className="flex items-start gap-3 py-3 last:pb-1">
                      <div className="w-11 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                        {String(item.start_time ?? "").slice(0, 5) || "—"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold leading-snug">
                          {item.title || "Aktivitas"}
                        </h4>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {item.location ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />
                              {item.location}
                            </span>
                          ) : null}
                          {item.start_time ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="size-3" />
                              {String(item.start_time).slice(0, 5)}
                              {item.end_time ? `–${String(item.end_time).slice(0, 5)}` : ""}
                            </span>
                          ) : null}
                        </p>
                        {item.notes ? (
                          <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">
                            {item.notes}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-[20px] bg-surface px-5 py-10 text-center ring-1 ring-border/60">
            <Plane className="mx-auto size-9 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-semibold">Belum ada agenda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pemilik perjalanan belum menambahkan aktivitas.
            </p>
          </div>
        )}
      </section>

      <footer className="mt-8 rounded-[24px] bg-foreground px-5 py-6 text-center text-background">
        <p className="text-sm font-semibold">Mau menyusun itinerary seperti ini?</p>
        <p className="mt-1 text-xs text-background/65">
          Simpan agenda, checklist, dan anggaran perjalananmu di Djiwa Travel.
        </p>
        <Link
          to="/my-trips"
          className="tap mx-auto mt-4 flex h-11 max-w-xs items-center justify-center rounded-xl bg-background text-sm font-semibold text-foreground"
        >
          Mulai di Djiwa Travel
        </Link>
      </footer>
    </Page>
  );
}
