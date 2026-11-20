import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { btnRed } from "@/components/shell";
import { SharedBudgetCard } from "@/components/shared-budget-card";
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

/** Travo drafts a template from a short brief; the member reviews it, then publishes. */
export function TravoTemplateSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [brief, setBrief] = useState("");
  const [days, setDays] = useState(3);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy("draft");
    try {
      const result = await generateTemplateDraft({ data: { brief, days } });
      if (result.status === "ok") setDraft(result.draft);
      else toast.error(result.message);
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
          destinationCode: draft.destinationCode ?? "ID",
          days: draft.days,
          items: draft.items.map((item) => ({
            day: item.day,
            start: item.start,
            end: item.end,
            title: item.title,
            location: item.location,
            category: item.category,
            costIdr: item.costIdr ?? null,
          })),
          budget: draft.budget?.categories ?? [],
        },
      });
      toast.success(publishedText(result.feed));
      setDraft(null);
      setBrief("");
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
            Ceritakan perjalanan idealmu. Travo menyusun draf, kamu periksa dulu sebelum
            diterbitkan. Cek jam buka dan harga sebelum berangkat.
          </SheetDescription>
        </SheetHeader>
        {!draft ? (
          <form onSubmit={generate} className="space-y-3">
            <textarea
              required
              minLength={8}
              maxLength={300}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Contoh: Liburan santai di Kyoto, suka kuliner dan kuil, budget menengah"
              aria-label="Permintaan untuk Travo"
              className={`${field} min-h-24`}
            />
            <label className="flex min-h-11 items-center justify-between rounded-2xl bg-secondary/70 px-4">
              <span className="text-sm font-medium">Jumlah hari</span>
              <input
                type="number"
                min={1}
                max={7}
                value={days}
                onChange={(event) =>
                  setDays(Math.max(1, Math.min(7, Number(event.target.value) || 1)))
                }
                className="w-14 bg-transparent text-right text-sm outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null}
              className={`${btnRed} w-full disabled:opacity-50`}
            >
              {busy === "draft" ? "Travo sedang menyusun…" : "Susun template"}
            </button>
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
            {draft.budget && (
              <SharedBudgetCard
                title="Estimasi anggaran"
                total={formatIdr(draft.budget.totalIdr)}
                note="Per orang · usulan Travo, cek harga terbaru"
                lines={draft.budget.categories.map((line) => ({
                  name: line.name,
                  amount: formatIdr(line.amountIdr),
                  share: draft.budget!.totalIdr ? line.amountIdr / draft.budget!.totalIdr : 0,
                }))}
              />
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
