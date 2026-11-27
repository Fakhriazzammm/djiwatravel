import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Flag, MapPin, Share2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { FixedLayer } from "@/components/motion-primitives";
import { BackBar, Page, Wordmark, btnRed, btnSoft } from "@/components/shell";
import { SharedBudgetCard } from "@/components/shared-budget-card";
import { SharedItineraryMap } from "@/components/shared-itinerary-map";
import { TemplateCover, TemplateDays } from "@/components/trip-template-ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatIdr, templatePath } from "@/lib/trip-templates";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { canonicalSearchPage } from "@/lib/public-search-pages";
import { getPublicTemplate, reportTemplate, copyTemplate } from "@/lib/trip-templates.fn";

export const Route = createFileRoute("/template/$slug")({
  loader: ({ params }) => getPublicTemplate({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const t = loaderData?.template;
    const title = t
      ? `${t.title} — Template Djiwa Travel`
      : "Template tidak ditemukan — Djiwa Travel";
    const description = t
      ? `${t.days} hari di ${t.destinationName}${t.ownerName ? ` oleh ${t.ownerName}` : ""}. Pakai itinerary ini lalu atur tanggalmu.`
      : "Template itinerary di Djiwa Travel.";
    const tripSchema = t
      ? {
          "@context": "https://schema.org",
          "@type": "TouristTrip",
          name: t.title,
          description: t.description || description,
          inLanguage: "id-ID",
          url: `https://djiwatravel.com${templatePath(t.slug)}`,
          ...(t.coverUrl ? { image: t.coverUrl } : {}),
          touristType: "Traveler Indonesia",
          provider: {
            "@type": "Organization",
            name: "Djiwa Travel",
            url: "https://djiwatravel.com",
          },
          itinerary: {
            "@type": "ItemList",
            numberOfItems: loaderData?.items.length ?? 0,
            itemListElement: (loaderData?.items ?? []).map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: `Hari ${item.day}: ${item.title}`,
              ...(item.location ? { description: item.location } : {}),
            })),
          },
        }
      : null;
    return {
      ...(tripSchema
        ? { scripts: [{ type: "application/ld+json", children: JSON.stringify(tripSchema) }] }
        : {}),
      ...(t ? { links: canonicalSearchPage(templatePath(t.slug)) } : {}),
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(t?.coverUrl ? [{ property: "og:image", content: t.coverUrl }] : []),
        ...(t ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: TemplatePage,
});

const MASCOT = "/assets/home-hero/mascot-map-v1.png";

/** Native share sheet, else copy. Only the creator's own link carries their affiliate code. */
async function shareTemplate(input: {
  slug: string;
  title: string;
  days: number;
  code: string | null;
}) {
  const url = `${window.location.origin}${templatePath(input.slug, input.code)}`;
  const text = `Template itinerary ${input.days} hari: ${input.title} di Djiwa Travel`;
  if (navigator.share) {
    try {
      await navigator.share({ title: input.title, text, url });
      return;
    } catch {
      // dismissed: fall back to copying
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Tautan template disalin");
  } catch {
    toast.error("Tautan belum bisa disalin.");
  }
}

/** Budget lines we can act on with our own features: flight search and eSIM. */
function budgetAction(name: string, destination: string) {
  if (/tiket pesawat/i.test(name))
    return {
      action: { label: "Cari tiket →", href: `/tiket?tujuan=${encodeURIComponent(destination)}` },
    };
  if (/esim/i.test(name)) return { action: { label: "Lihat eSIM →", href: "/esim/finder" } };
  return {};
}

function tomorrow() {
  const d = new Date(Date.now() + 86_400_000);
  return d.toISOString().slice(0, 10);
}

function TemplatePage() {
  const data = Route.useLoaderData();
  const { user, loading } = useBetterAuthUser();
  const [useOpen, setUseOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const rows = useMemo(
    () => (data?.items ?? []).map((item, index) => ({ ...item, id: `${item.day}-${index}` })),
    [data],
  );
  const mapDays = useMemo(() => {
    const byDay = new Map<number, typeof rows>();
    for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
    return [...byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, list]) => ({
        key: `hari-${day}`,
        label: `Hari ${day}`,
        items: list.map((row) => ({
          id: row.id,
          title: row.title,
          latitude: row.lat,
          longitude: row.lng,
        })),
      }));
  }, [rows]);
  if (!data)
    return (
      <Page>
        <BackBar title="Template" fallbackTo="/template" />
        <div className="mt-10 text-center">
          <p className="text-[15px] font-semibold">Template tidak ditemukan</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Template ini sudah dinonaktifkan atau tautannya salah.
          </p>
          <Link to="/template" className={`${btnSoft} mt-4 inline-flex px-5`}>
            Lihat template lain
          </Link>
        </div>
      </Page>
    );
  const { template, isOwner, shareCode } = data;
  const onShare = () =>
    void shareTemplate({
      slug: template.slug,
      title: template.title,
      days: template.days,
      code: shareCode,
    });
  const budget = template.budget;
  return (
    <Page tabs={false}>
      <BackBar
        title="Template"
        fallbackTo="/template"
        action={
          <button
            type="button"
            onClick={onShare}
            aria-label="Bagikan template"
            className="tap inline-flex size-9 items-center justify-center rounded-full bg-secondary"
          >
            <Share2 className="size-4" aria-hidden="true" />
          </button>
        }
      />
      <div className="space-y-3 pb-32">
        <div className="flex items-center gap-2">
          <Wordmark className="h-6" />
          <span className="text-[11px] font-semibold text-muted-foreground">
            Template itinerary
          </span>
        </div>
        <TemplateCover
          url={template.coverUrl}
          title={template.destinationName}
          className="h-44"
          branded
        />
        <div>
          <h1 className="text-[20px] font-bold leading-6">{template.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
            <MapPin className="size-3" aria-hidden="true" />
            {template.destinationName} · {template.days} hari ·{" "}
            {template.byTravo ? (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3 text-brand-red" aria-hidden="true" /> Disusun Travo
              </span>
            ) : (
              <span>oleh {template.ownerName ?? "member Djiwa"}</span>
            )}
            {template.uses > 0 && <span>· dipakai {template.uses}x</span>}
          </p>
          {template.description && (
            <p className="mt-2 text-[13px] leading-5 text-foreground/80">{template.description}</p>
          )}
        </div>
        {budget && (
          <SharedBudgetCard
            title="Estimasi anggaran"
            total={formatIdr(budget.totalIdr)}
            note="Per orang · perkiraan, cek harga terbaru sebelum berangkat"
            lines={budget.categories.map((line) => ({
              name: line.name,
              amount: formatIdr(line.amountIdr),
              share: budget.totalIdr ? line.amountIdr / budget.totalIdr : 0,
              ...(line.note ? { note: line.note } : {}),
              ...budgetAction(line.name, template.destinationName),
            }))}
          />
        )}
        <SharedItineraryMap days={mapDays} activeId={activeId} onActiveChange={setActiveId} />
        <TemplateDays
          items={rows}
          days={template.days}
          activeId={activeId}
          onSelect={setActiveId}
        />
        <aside className="flex items-center gap-3 rounded-2xl bg-brand-red/10 p-3 ring-1 ring-brand-red/15">
          <img src={MASCOT} alt="" aria-hidden="true" className="h-16 w-auto shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold">Dibuat dengan Djiwa Travel</p>
            <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
              Susun itinerary, anggaran, dan peta perjalananmu sendiri, lalu bagikan ke temanmu.
            </p>
            <Link
              to="/my-trips/new"
              className="tap mt-1.5 inline-flex text-[12px] font-bold text-brand-red"
            >
              Buat itinerary-mu →
            </Link>
          </div>
        </aside>
        {!isOwner && (
          <button
            type="button"
            onClick={() =>
              user ? setReportOpen(true) : toast.info("Masuk untuk melaporkan template")
            }
            className="tap mx-auto flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            <Flag className="size-3" aria-hidden="true" /> Laporkan template
          </button>
        )}
      </div>
      {/* Floating bar. It is portalled to <body>: inside the page wrapper a transformed ancestor would
          make `fixed` behave like `absolute` and the bar would scroll away with the content. */}
      <FixedLayer>
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-40 px-4">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <button
              type="button"
              onClick={onShare}
              aria-label="Bagikan template"
              className="tap pointer-events-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-surface text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.2)] ring-1 ring-border/60"
            >
              <Share2 className="size-5" aria-hidden="true" />
            </button>
            {isOwner ? (
              <Link
                to="/my-templates"
                className={`${btnSoft} pointer-events-auto !h-12 flex-1 !rounded-full bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.2)] ring-1 ring-border/60`}
              >
                Ini templatemu · kelola
              </Link>
            ) : (
              <button
                type="button"
                className={`${btnRed} pointer-events-auto flex-1 !rounded-full shadow-[0_10px_28px_rgba(196,53,59,0.45)]`}
                onClick={() => setUseOpen(true)}
              >
                Pakai template ini
              </button>
            )}
          </div>
        </div>
      </FixedLayer>
      <UseSheet
        open={useOpen}
        onOpenChange={setUseOpen}
        slug={template.slug}
        title={template.title}
        days={template.days}
        signedIn={Boolean(user)}
        authLoading={loading}
      />
      <ReportSheet open={reportOpen} onOpenChange={setReportOpen} slug={template.slug} />
    </Page>
  );
}

function UseSheet({
  open,
  onOpenChange,
  slug,
  title,
  days,
  signedIn,
  authLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  title: string;
  days: number;
  signedIn: boolean;
  authLoading: boolean;
}) {
  const navigate = useNavigate();
  const [date, setDate] = useState(tomorrow());
  const [travelers, setTravelers] = useState(1);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const trip = await copyTemplate({ data: { slug, departureDate: date, travelers } });
      toast.success("Perjalanan dibuat dari template");
      await navigate({ to: "/my-trips/$tripId", params: { tripId: trip.tripId } });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Template belum bisa dipakai.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7"
      >
        <SheetHeader className="mb-3 text-left">
          <SheetTitle>Pakai template ini</SheetTitle>
          <SheetDescription>
            {signedIn
              ? `“${title}” disalin jadi perjalananmu sendiri (${days} hari). Kamu bebas mengubahnya.`
              : "Masuk dulu supaya template tersimpan di akunmu. Setelah masuk, kamu kembali ke halaman ini."}
          </SheetDescription>
        </SheetHeader>
        {authLoading ? null : !signedIn ? (
          <CustomerAuth label="Masuk untuk memakai template" />
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-secondary/70 px-4">
              <span className="text-sm font-medium">Tanggal berangkat</span>
              <input
                required
                type="date"
                min={tomorrow().slice(0, 10)}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="bg-transparent text-right text-sm outline-none"
              />
            </label>
            <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-secondary/70 px-4">
              <span className="text-sm font-medium">Jumlah traveler</span>
              <input
                type="number"
                min={1}
                max={50}
                value={travelers}
                onChange={(event) =>
                  setTravelers(Math.max(1, Math.min(50, Number(event.target.value) || 1)))
                }
                className="w-16 bg-transparent text-right text-sm outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className={`${btnRed} w-full disabled:opacity-50`}
            >
              {busy ? "Menyalin…" : "Buat perjalanan"}
            </button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ReportSheet({
  open,
  onOpenChange,
  slug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await reportTemplate({ data: { slug, reason } });
      toast.success("Laporan terkirim. Terima kasih.");
      setReason("");
      onOpenChange(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Laporan belum terkirim.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-lg rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7"
      >
        <SheetHeader className="mb-3 text-left">
          <SheetTitle>Laporkan template</SheetTitle>
          <SheetDescription>Ceritakan singkat apa yang tidak pantas atau keliru.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-3">
          <textarea
            required
            minLength={3}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-24 w-full rounded-2xl bg-secondary/70 p-3 text-[14px] outline-none"
            aria-label="Alasan laporan"
          />
          <button type="submit" disabled={busy} className={`${btnRed} w-full disabled:opacity-50`}>
            Kirim laporan
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
