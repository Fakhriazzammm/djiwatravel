import { LOADING_LINES, MascotLoader } from "@/components/mascot-loader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ExternalLink, Search, X } from "lucide-react";
import { toast } from "sonner";
import { loadPlaceIdeas } from "@/lib/place-ideas.fn";
import { deleteItinerary, postItinerary } from "@/lib/my-trips.fn";
import { isTripAuthenticationError } from "@/lib/trip-actions";
import { estimateLeg, formatKm, formatMinutes, distanceKm } from "@/lib/itinerary-map";
import {
  PLACE_IDEA_CATEGORIES,
  placeIdeaCategory,
  suggestSlot,
  type PlaceIdea,
  type PlaceIdeaCategoryId,
  type PlaceIdeasResponse,
  type PlaceIdeasStatus,
} from "@/lib/place-ideas";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export type IdeaDay = {
  date: string;
  /** "Rab, 4 Nov" */
  label: string;
  items: {
    start: string | null;
    end: string | null;
    lat: number | null;
    lng: number | null;
  }[];
};

type Load =
  | { state: "loading" }
  | { state: "ok"; ideas: PlaceIdea[]; remaining: number }
  | { state: "fail"; message: string; remaining: number };

/* ------------------------------------------------------------------ category artwork */

const ART: Record<string, string> = {
  nature: `<rect width="100" height="100" fill="#cfe6f2"/><circle cx="78" cy="22" r="9" fill="#fbe7a1"/><path d="M0 70Q25 48 50 66T100 58V100H0Z" fill="#8fbf7a"/><path d="M0 82Q30 66 60 80T100 74V100H0Z" fill="#5f9a56"/><rect x="26" y="52" width="5" height="22" fill="#6b4a32"/><circle cx="28" cy="46" r="15" fill="#3f8a4a"/><rect x="62" y="58" width="4" height="18" fill="#6b4a32"/><circle cx="64" cy="53" r="11" fill="#4f9c57"/>`,
  cafe: `<rect width="100" height="100" fill="#e9d9c6"/><rect y="68" width="100" height="32" fill="#b98b62"/><path d="M30 40h34v22a12 12 0 0 1-12 12H42a12 12 0 0 1-12-12Z" fill="#fff"/><path d="M64 46h6a7 7 0 0 1 0 14h-6" fill="none" stroke="#fff" stroke-width="5"/><rect x="33" y="43" width="28" height="7" rx="3" fill="#6d4630"/>`,
  sight: `<rect width="100" height="100" fill="#f6d9b8"/><circle cx="50" cy="40" r="22" fill="#f3b98a"/><path d="M0 78Q50 60 100 78V100H0Z" fill="#6c8f5e"/><rect x="26" y="40" width="6" height="40" fill="#c63b3f"/><rect x="68" y="40" width="6" height="40" fill="#c63b3f"/><path d="M18 36h64l-5 8H23Z" fill="#a8282d"/><rect x="28" y="50" width="44" height="5" fill="#c63b3f"/>`,
  shop: `<rect width="100" height="100" fill="#f1e5d2"/><path d="M6 30h30v12H6Z" fill="#d35a14"/><path d="M36 30h30v12H36Z" fill="#f2b84b"/><path d="M66 30h28v12H66Z" fill="#c63b3f"/><rect x="8" y="42" width="84" height="38" fill="#e0c9a6"/><circle cx="24" cy="62" r="8" fill="#e85d4a"/><circle cx="46" cy="64" r="8" fill="#8fbf5a"/><circle cx="70" cy="62" r="8" fill="#f2b84b"/>`,
  food: `<rect width="100" height="100" fill="#f6e3cf"/><ellipse cx="50" cy="62" rx="34" ry="12" fill="#fff"/><ellipse cx="50" cy="56" rx="28" ry="16" fill="#d9822b"/><path d="M30 52q10-14 20 0t20 0" stroke="#f2b84b" stroke-width="5" fill="none"/><path d="M34 30l8 14M44 26l6 18" stroke="#6b4a32" stroke-width="3"/>`,
};

/** A real photo when one clearly belongs to the place, otherwise an illustration of its kind. */
function IdeaThumb({
  idea,
  className,
}: {
  idea: Pick<PlaceIdea, "imageUrl" | "category" | "name">;
  className: string;
}) {
  const [broken, setBroken] = useState(false);
  if (idea.imageUrl && !broken) {
    return (
      <img
        src={idea.imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`${className} bg-secondary object-cover`}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ART[idea.category] ?? ART["sight"]! }}
    />
  );
}

/* ------------------------------------------------------------------------ distance */

function reference(day: IdeaDay | undefined) {
  const withPoint = (day?.items ?? []).filter((item) => item.lat !== null && item.lng !== null);
  const last = withPoint[withPoint.length - 1];
  return last ? { lat: last.lat!, lng: last.lng! } : null;
}

function nearLabel(idea: PlaceIdea, from: { lat: number; lng: number } | null) {
  if (!from || idea.lat === null || idea.lng === null) return null;
  const km = distanceKm(from, { lat: idea.lat, lng: idea.lng });
  const leg = estimateLeg(km);
  return leg.mode === "walk"
    ? `${formatMinutes(leg.minutes)} jalan`
    : `${formatKm(km)} · ≈${formatMinutes(leg.minutes)}`;
}

/* -------------------------------------------------------------------- the feature */

export function PlaceIdeasFeature({
  tripId,
  destination,
  status,
  days,
  defaultDate,
  open,
  onOpenChange,
  onAdded,
}: {
  tripId: string;
  destination: string;
  status: PlaceIdeasStatus;
  days: IdeaDay[];
  defaultDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => Promise<void>;
}) {
  const [loads, setLoads] = useState<Record<string, Load>>({});
  const [category, setCategory] = useState<PlaceIdeaCategoryId>("all");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [picked, setPicked] = useState<PlaceIdea | null>(null);

  const keyOf = (cat: string, q: string) => `${cat}|${q}`;

  const fetchIdeas = useCallback(
    async (cat: PlaceIdeaCategoryId, q: string) => {
      const key = keyOf(cat, q);
      setLoads((current) => ({ ...current, [key]: { state: "loading" } }));
      let answer: PlaceIdeasResponse;
      try {
        answer = await loadPlaceIdeas({ data: { tripId, category: cat, query: q } });
      } catch {
        answer = {
          status: "error",
          message: "Ide belum bisa dimuat. Coba lagi sebentar.",
          remaining: 0,
        };
      }
      setLoads((current) => ({
        ...current,
        [key]:
          answer.status === "ok"
            ? { state: "ok", ideas: answer.ideas, remaining: answer.remaining }
            : { state: "fail", message: answer.message, remaining: answer.remaining },
      }));
    },
    [tripId],
  );

  // The small carousel loads once when the Agenda opens (a cached answer costs nothing).
  useEffect(() => {
    if (status.available && status.showStrip) void fetchIdeas("all", "");
  }, [status.available, status.showStrip, fetchIdeas]);

  // The sheet loads the chosen category the first time it is needed.
  useEffect(() => {
    if (!open || !status.available) return;
    const key = keyOf(category, activeQuery);
    if (!loads[key]) void fetchIdeas(category, activeQuery);
  }, [open, status.available, category, activeQuery, loads, fetchIdeas]);

  if (!status.available) return null;

  const stripLoad = loads[keyOf("all", "")];
  const current = loads[keyOf(category, activeQuery)];
  const day = days.find((d) => d.date === defaultDate) ?? days[0];

  const openIdea = (idea: PlaceIdea) => {
    setPicked(idea);
    onOpenChange(true);
  };
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setPicked(null);
  };

  return (
    <>
      {status.showStrip &&
      stripLoad &&
      (stripLoad.state === "loading" || stripLoad.state === "ok") ? (
        <IdeasStrip
          destination={destination}
          load={stripLoad}
          from={reference(day)}
          onPick={openIdea}
          onMore={() => {
            setPicked(null);
            onOpenChange(true);
          }}
        />
      ) : null}
      <Sheet open={open} onOpenChange={close}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border-border/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:rounded-t-[28px]"
        >
          <div
            className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/25"
            aria-hidden="true"
          />
          {picked ? (
            <IdeaDetail
              idea={picked}
              tripId={tripId}
              days={days}
              defaultDate={defaultDate}
              onBack={() => setPicked(null)}
              onAdded={async () => {
                close(false);
                await onAdded();
              }}
              onUndone={onAdded}
            />
          ) : (
            <>
              <div className="pr-8 text-left">
                <SheetTitle className="text-[18px] font-bold tracking-tight">
                  Ke mana lagi ya?
                </SheetTitle>
                <SheetDescription className="text-[12px]">
                  {day ? `${day.label} · ` : ""}ide tempat di {destination}
                </SheetDescription>
              </div>
              <form
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  const q = query.trim();
                  setActiveQuery(q);
                  if (q) setCategory("all");
                }}
                className="relative mt-3"
              >
                <label htmlFor="place-ideas-q" className="sr-only">
                  Cari tempat
                </label>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="place-ideas-q"
                  value={query}
                  maxLength={80}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari: kafe, museum, ramen…"
                  className="min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 pl-9 pr-9 text-[14px] outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
                />
                {activeQuery ? (
                  <button
                    type="button"
                    aria-label="Hapus pencarian"
                    onClick={() => {
                      setQuery("");
                      setActiveQuery("");
                    }}
                    className="tap absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-muted-foreground"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </form>
              <div
                className="mt-2 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="group"
                aria-label="Jenis tempat"
              >
                {PLACE_IDEA_CATEGORIES.map((item) => {
                  const on = !activeQuery && category === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setQuery("");
                        setActiveQuery("");
                        setCategory(item.id);
                      }}
                      className={`tap ios-chip shrink-0 ${on ? "bg-brand-red text-white" : "bg-secondary text-foreground"}`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <IdeasList
                load={current}
                from={reference(day)}
                onPick={setPicked}
                onRetry={() => void fetchIdeas(category, activeQuery)}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ----------------------------------------------------------------------- strip */

function IdeasStrip({
  destination,
  load,
  from,
  onPick,
  onMore,
}: {
  destination: string;
  load: Extract<Load, { state: "loading" } | { state: "ok" }>;
  from: { lat: number; lng: number } | null;
  onPick: (idea: PlaceIdea) => void;
  onMore: () => void;
}) {
  if (load.state === "ok" && load.ideas.length === 0) return null;
  return (
    <section aria-label="Ide tempat" className="pt-3" data-testid="place-ideas-strip">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="ios-section-label truncate">Ide tempat di {destination}</h2>
        <button
          type="button"
          onClick={onMore}
          className="tap min-h-8 shrink-0 px-1 text-[12px] font-semibold text-brand-red"
        >
          Lainnya
        </button>
      </div>
      <div className="mt-1.5 flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {load.state === "loading"
          ? (
              <div className="w-full">
                <MascotLoader compact lines={LOADING_LINES.ideas} label="Memuat ide tempat" />
              </div>
            )
          : load.ideas.slice(0, 6).map((idea) => (
              <button
                key={idea.key}
                type="button"
                onClick={() => onPick(idea)}
                className="tap w-[116px] shrink-0 rounded-xl bg-surface p-1.5 text-left shadow-sm ring-1 ring-border/50"
              >
                <IdeaThumb idea={idea} className="h-[68px] w-full rounded-lg" />
                <span className="mt-1.5 block truncate text-[12px] font-semibold">{idea.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {placeIdeaCategory(idea.category).label}
                  {nearLabel(idea, from) ? ` · ${nearLabel(idea, from)}` : ""}
                </span>
              </button>
            ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ list */

function IdeasList({
  load,
  from,
  onPick,
  onRetry,
}: {
  load: Load | undefined;
  from: { lat: number; lng: number } | null;
  onPick: (idea: PlaceIdea) => void;
  onRetry: () => void;
}) {
  if (!load || load.state === "loading") {
    return (
      <div className="mt-2">
        <MascotLoader lines={LOADING_LINES.ideas} label="Memuat ide tempat" />
      </div>
    );
  }
  if (load.state === "fail") {
    return (
      <div className="mt-3 rounded-2xl bg-secondary p-3 text-center">
        <p className="text-[13px] font-semibold">{load.message}</p>
        {load.remaining > 0 ? (
          <button
            type="button"
            onClick={onRetry}
            className="tap ios-btn mt-2 bg-background text-brand-red"
          >
            Coba lagi
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <ul className="mt-2 divide-y divide-border/70">
      {load.ideas.map((idea) => {
        const near = nearLabel(idea, from);
        return (
          <li key={idea.key}>
            <button
              type="button"
              onClick={() => onPick(idea)}
              className="tap flex w-full items-center gap-3 py-2.5 text-left"
            >
              <IdeaThumb idea={idea} className="size-16 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{idea.name}</span>
                <span className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                  {idea.why}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {placeIdeaCategory(idea.category).label}
                  {near ? ` · ${near}` : ""} · {idea.sourceHost}
                </span>
              </span>
              <span className="ios-chip shrink-0 bg-brand-red text-white">Tambah</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------------- detail */

function IdeaDetail({
  idea,
  tripId,
  days,
  defaultDate,
  onBack,
  onAdded,
  onUndone,
}: {
  idea: PlaceIdea;
  tripId: string;
  days: IdeaDay[];
  defaultDate: string;
  onBack: () => void;
  onAdded: () => Promise<void>;
  onUndone: () => Promise<void>;
}) {
  const startDate = days.some((d) => d.date === defaultDate)
    ? defaultDate
    : (days[0]?.date ?? defaultDate);
  const [date, setDate] = useState(startDate);
  const day = days.find((d) => d.date === date);
  const slot = useMemo(() => suggestSlot(day?.items ?? []), [day]);
  const [start, setStart] = useState(slot.start);
  const [end, setEnd] = useState(slot.end);
  const [saving, setSaving] = useState(false);
  const near = nearLabel(idea, reference(day));

  // Choosing another day suggests that day's free slot again.
  useEffect(() => {
    setStart(slot.start);
    setEnd(slot.end);
  }, [slot]);

  async function add() {
    if (saving) return;
    setSaving(true);
    try {
      const saved = (await postItinerary({
        data: {
          tripId,
          title: idea.name,
          activityDate: date,
          startTime: start,
          endTime: end > start ? end : undefined,
          location: idea.area ? `${idea.name}, ${idea.area}` : idea.name,
          ...(idea.lat !== null && idea.lng !== null
            ? { latitude: idea.lat, longitude: idea.lng }
            : {}),
          notes: `${idea.why} (Sumber: ${idea.sourceHost})`.slice(0, 2000),
          activityCategory: placeIdeaCategory(idea.category).activityCategory || undefined,
        },
      })) as { id?: string } | undefined;
      const id = saved?.id;
      toast.success(`Ditambahkan ke ${day?.label ?? "agenda"}`, {
        ...(id
          ? {
              action: {
                label: "Urungkan",
                onClick: () => {
                  void deleteItinerary({ data: { id } })
                    .then(onUndone)
                    .catch(() => toast.error("Belum bisa diurungkan. Hapus dari Agenda."));
                },
              },
            }
          : {}),
      });
      await onAdded();
    } catch (error) {
      toast.error(
        isTripAuthenticationError(error)
          ? "Sesi berakhir. Masuk kembali untuk menambahkan."
          : "Belum tersimpan. Periksa jam lalu coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="relative -mx-4 -mt-1 overflow-hidden">
        <IdeaThumb idea={idea} className="h-36 w-full" />
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali ke daftar"
          className="tap absolute left-3 top-3 flex size-9 items-center justify-center rounded-full bg-surface/95 shadow"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>
      <SheetTitle className="mt-3 text-[18px] font-bold tracking-tight">{idea.name}</SheetTitle>
      <SheetDescription className="text-[12px]">
        {placeIdeaCategory(idea.category).label}
        {idea.area ? ` · ${idea.area}` : ""}
        {near ? ` · ${near}` : ""}
      </SheetDescription>
      <p className="mt-2 text-[13px] leading-snug">{idea.why}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        <a
          href={idea.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
        >
          Sumber: {idea.sourceHost} <ExternalLink className="size-3" />
        </a>
        {idea.imageUrl ? <span>Foto: Wikipedia</span> : null}
      </p>
      {days.length > 1 ? (
        <div className="mt-3 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              aria-pressed={d.date === date}
              onClick={() => setDate(d.date)}
              className={`tap ios-chip shrink-0 ${d.date === date ? "bg-brand-red text-white" : "bg-secondary"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="rounded-xl bg-secondary px-3 py-1.5">
          <span className="block text-[10px] text-muted-foreground">Mulai</span>
          <input
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="w-full bg-transparent text-[14px] font-semibold outline-none"
          />
        </label>
        <label className="rounded-xl bg-secondary px-3 py-1.5">
          <span className="block text-[10px] text-muted-foreground">Selesai</span>
          <input
            type="time"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="w-full bg-transparent text-[14px] font-semibold outline-none"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void add()}
        disabled={saving || !start}
        className="tap ios-btn mt-3 w-full bg-brand-red text-white disabled:opacity-60"
      >
        {saving ? "Menyimpan…" : `Tambah ke ${day?.label ?? "agenda"}`}
      </button>
    </div>
  );
}
