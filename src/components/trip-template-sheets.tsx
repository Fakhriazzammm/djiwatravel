import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { btnRed } from "@/components/shell";
import { FlightPlaceField } from "@/components/flight-place-field";
import { SharedBudgetCard } from "@/components/shared-budget-card";
import { TripCountryPicker } from "@/components/trip-country-picker";
import { TemplateDays } from "@/components/trip-template-ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  generateTemplateDraft,
  publishDraftTemplate,
  publishTripTemplate,
} from "@/lib/trip-templates.fn";
import type { FlightPlace } from "@/lib/flights";
import type { TripCountry } from "@/lib/trip-countries";
import { formatIdr, type TemplateDraft } from "@/lib/trip-templates";

const content =
  "mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7";
const field = "w-full rounded-2xl bg-secondary/70 px-3 py-2.5 text-[14px] outline-none";

function publishedText(
  feed: { posted: boolean; pending: boolean; message?: string | undefined } | undefined,
) {
  if (feed?.posted)
    return feed.pending
      ? "Template tayang. Postingan Feeds menunggu tinjauan."
      : "Template tayang dan dibagikan ke Feeds";
  return feed?.message ? `Template tayang. ${feed.message}` : "Template tayang";
}

function TimelineNotice() {
  return (
    <p className="text-[12px] leading-4 text-muted-foreground">
      Dengan izin Komunitas, itinerary yang kamu terbitkan langsung dibagikan ke Feeds.
    </p>
  );
}

function errorText(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : "";
  return message === "Autentikasi diperlukan"
    ? "Masuk dulu untuk membuat template."
    : message || fallback;
}

/** "Jadikan template" from a trip: only titles, places, times and photos are copied. */
export function PublishTripTemplateSheet({
  open,
  onOpenChange,
  trip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: { id: string; name: string; destination_name: string };
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(trip.name);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await publishTripTemplate({
        data: { tripId: trip.id, title, description },
      });
      toast.success(publishedText(result.feed));
      onOpenChange(false);
      await navigate({ to: "/my-templates" });
    } catch (cause) {
      toast.error(errorText(cause, "Template belum bisa dibuat."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={content}>
        <SheetHeader className="mb-3 text-left">
          <SheetTitle>Jadikan template</SheetTitle>
          <SheetDescription>
            Orang lain bisa melihat dan memakai agenda perjalanan ini beserta rencana anggarannya
            per orang. Catatan, pengeluaran nyata, pemesanan, dan dokumen tidak ikut. Tanggal
            diganti jadi Hari 1, Hari 2, dan seterusnya.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-3">
          <input
            required
            minLength={3}
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Judul template"
            className={field}
          />
          <textarea
            maxLength={600}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={`Ceritakan singkat itinerary ${trip.destination_name} ini (opsional)`}
            aria-label="Deskripsi"
            className={`${field} min-h-20`}
          />
          <TimelineNotice />
          <button type="submit" disabled={busy} className={`${btnRed} w-full disabled:opacity-50`}>
            {busy ? "Menerbitkan…" : "Terbitkan template"}
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const STYLES = [
  ["auto", "Otomatis"],
  ["hemat", "Hemat"],
  ["nyaman", "Nyaman"],
] as const;

/** Budget lines we can act on with our own features: flight search and eSIM. */
function lineAction(name: string, destination: string) {
  if (/tiket pesawat/i.test(name))
    return {
      action: { label: "Cari tiket →", href: `/tiket?tujuan=${encodeURIComponent(destination)}` },
    };
  if (/esim/i.test(name)) return { action: { label: "Lihat eSIM →", href: "/esim/finder" } };
  return {};
}

/**
 * Travo drafts a template from our own data (recorded fares, the eSIM catalog, city costs and map
 * places; the internet only fills what we lack). The member reviews the draft, its budget and its
 * sources, then publishes.
 */
export function TravoTemplateSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [country, setCountry] = useState<TripCountry | null>(null);
  const [city, setCity] = useState("");
  const [days, setDays] = useState(4);
  const [style, setStyle] = useState<(typeof STYLES)[number][0]>("auto");
  const [interests, setInterests] = useState("");
  const [origin, setOrigin] = useState<FlightPlace | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!country) {
      toast.error("Pilih negara tujuan dulu.");
      return;
    }
    setBusy("draft");
    try {
      const result = await generateTemplateDraft({
        data: {
          country: { code: country.code, name: country.name },
          city: { name: city.trim() },
          days,
          style,
          interests: interests
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 7),
          origin: origin ? { code: origin.code, name: origin.name } : null,
        },
      });
      if (result.status === "ok") {
        setDraft(result.draft);
        setSources(result.sources);
      } else toast.error(result.message);
    } catch (cause) {
      toast.error(errorText(cause, "Travo belum bisa menyusun template."));
    } finally {
      setBusy(null);
    }
  }
  async function publish() {
    if (!draft) return;
    setBusy("publish");
    try {
      const result = await publishDraftTemplate({
        data: {
          title: draft.title,
          description: draft.description,
          destinationName: draft.destinationName,
          destinationCode: draft.destinationCode ?? country?.code ?? "ID",
          days: draft.days,
          items: draft.items.map((item) => ({
            day: item.day,
            start: item.start,
            end: item.end,
            title: item.title,
            location: item.location,
            category: item.category,
            costIdr: item.costIdr ?? null,
            lat: item.lat ?? null,
            lng: item.lng ?? null,
          })),
          budget: (draft.budget?.categories ?? []).map((line) => ({
            name: line.name,
            amountIdr: line.amountIdr,
            ...(line.note ? { note: line.note } : {}),
          })),
        },
      });
      toast.success(publishedText(result.feed));
      setDraft(null);
      setSources([]);
      onOpenChange(false);
      await navigate({ to: "/my-templates" });
    } catch (cause) {
      toast.error(errorText(cause, "Template belum bisa diterbitkan."));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={content}>
        <SheetHeader className="mb-3 text-left">
          <SheetTitle className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-brand-red" aria-hidden="true" /> Buat dengan Travo
          </SheetTitle>
          <SheetDescription>
            Travo menyusun itinerary, anggaran, tiket, dan eSIM dari data Djiwa Travel: harga tiket
            tercatat, katalog eSIM, biaya kota, dan tempat di peta. Hanya yang belum kami punya
            dicari dari internet.
          </SheetDescription>
        </SheetHeader>
        {!draft ? (
          <form onSubmit={generate} className="space-y-3">
            <TripCountryPicker value={country?.code ?? ""} onChange={(next) => setCountry(next)} />
            <input
              required
              minLength={2}
              maxLength={60}
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Kota basis perjalanan (contoh: Kyoto)"
              aria-label="Kota"
              className={field}
            />
            <FlightPlaceField
              id="template-origin"
              label="Berangkat dari (opsional, default Jakarta)"
              value={origin}
              onPick={setOrigin}
            />
            <label className="flex min-h-11 items-center justify-between rounded-2xl bg-secondary/70 px-4">
              <span className="text-sm font-medium">Jumlah hari</span>
              <input
                type="number"
                min={1}
                max={10}
                value={days}
                onChange={(event) =>
                  setDays(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
                }
                className="w-14 bg-transparent text-right text-sm outline-none"
              />
            </label>
            <div className="flex gap-1.5" role="group" aria-label="Gaya anggaran">
              {STYLES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={style === value}
                  onClick={() => setStyle(value)}
                  className={`tap min-h-9 flex-1 rounded-full text-[12px] font-semibold ${
                    style === value
                      ? "bg-brand-red text-white"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={interests}
              onChange={(event) => setInterests(event.target.value)}
              maxLength={140}
              placeholder="Minat, pisahkan koma (kuliner, kuil, belanja)"
              aria-label="Minat"
              className={field}
            />
            <button
              type="submit"
              disabled={busy !== null}
              className={`${btnRed} w-full disabled:opacity-50`}
            >
              {busy === "draft" ? "Travo sedang mengumpulkan data…" : "Susun template"}
            </button>
            {busy === "draft" && (
              <p className="text-center text-[11px] text-muted-foreground">
                Mengambil harga tiket, eSIM, biaya kota, dan tempat di peta. Bisa sampai 1 menit.
              </p>
            )}
          </form>
        ) : (
          <div className="space-y-3">
            <input
              value={draft.title}
              maxLength={120}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              aria-label="Judul template"
              className={field}
            />
            <textarea
              value={draft.description}
              maxLength={600}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              aria-label="Deskripsi"
              className={`${field} min-h-16`}
            />
            {draft.budget && (
              <SharedBudgetCard
                title="Estimasi anggaran"
                total={formatIdr(draft.budget.totalIdr)}
                note="Per orang · cek harga terbaru sebelum berangkat"
                lines={draft.budget.categories.map((line) => ({
                  name: line.name,
                  amount: formatIdr(line.amountIdr),
                  share: draft.budget!.totalIdr ? line.amountIdr / draft.budget!.totalIdr : 0,
                  ...(line.note ? { note: line.note } : {}),
                  ...lineAction(line.name, draft.destinationName),
                }))}
              />
            )}
            <TemplateDays
              days={draft.days}
              items={draft.items.map((item) => ({
                day: item.day,
                start: item.start,
                end: item.end,
                title: item.title,
                location: item.location,
                category: item.category,
                costIdr: item.costIdr ?? null,
                image: null,
              }))}
            />
            {sources.length > 0 && (
              <section
                aria-label="Sumber data"
                className="rounded-2xl bg-secondary/60 p-3 text-[11px] leading-4 text-muted-foreground"
              >
                <p className="mb-1 font-semibold text-foreground">Sumber data</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {sources.map((source) => (
                    <li key={source}>{source}</li>
                  ))}
                </ul>
              </section>
            )}
            <TimelineNotice />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="tap h-11 rounded-xl bg-secondary text-[14px] font-semibold"
              >
                Ulangi
              </button>
              <button
                type="button"
                disabled={busy !== null || draft.title.trim().length < 3}
                onClick={publish}
                className="tap h-11 rounded-xl bg-brand-red text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {busy === "publish" ? "Menerbitkan…" : "Terbitkan"}
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
