import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Copy, Eye, EyeOff, RefreshCw, Share2, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { BackBar, Page, btnRed } from "@/components/shell";
import { TravoTemplateSheet } from "@/components/trip-template-sheets";
import { ConfirmDialog } from "@/components/trip-ios";
import { templatePath } from "@/lib/trip-templates";
import {
  deleteTemplate,
  listMyTemplates,
  refreshTemplate,
  updateTemplate,
} from "@/lib/trip-templates.fn";

export const Route = createFileRoute("/my-templates")({
  head: () => ({
    meta: [{ title: "Template saya — Djiwa Travel" }, { name: "robots", content: "noindex" }],
  }),
  loader: () => listMyTemplates(),
  component: MyTemplates,
});

const STATUS: Record<string, string> = {
  published: "Tayang",
  unpublished: "Nonaktif",
  hidden: "Disembunyikan Admin",
};

function MyTemplates() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [travoOpen, setTravoOpen] = useState(false);
  const [remove, setRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data.signedIn)
    return (
      <Page>
        <BackBar title="Template saya" fallbackTo="/template" />
        <div className="mt-8 space-y-3 text-center">
          <p className="text-[15px] font-semibold">Masuk untuk membuat template</p>
          <p className="text-[12px] text-muted-foreground">
            Bagikan itinerary-mu supaya traveler lain bisa memakainya.
          </p>
          <CustomerAuth />
        </div>
      </Page>
    );
  const affiliate = data.affiliate;
  const base = typeof window === "undefined" ? "" : window.location.origin;
  const linkFor = (slug: string) => `${base}${templatePath(slug, affiliate.code)}`;
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await router.invalidate();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Belum berhasil. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  async function share(slug: string, title: string) {
    const url = linkFor(slug);
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Itinerary ${title} di Djiwa Travel`, url });
        return;
      } catch {
        // dismissed: fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tautan disalin");
    } catch {
      toast.error("Tautan belum bisa disalin.");
    }
  }
  return (
    <Page>
      <BackBar title="Template saya" fallbackTo="/template" />
      <div className="space-y-3">
        {data.aiAvailable && (
          <button
            type="button"
            onClick={() => setTravoOpen(true)}
            className="tap flex w-full items-center gap-3 rounded-2xl bg-brand-red/10 px-3 py-3 text-left ring-1 ring-brand-red/20"
          >
            <Sparkles className="size-5 shrink-0 text-brand-red" aria-hidden="true" />
            <span>
              <span className="block text-[14px] font-semibold">Buat dengan Travo</span>
              <span className="block text-[12px] text-muted-foreground">
                Ceritakan perjalanannya, Travo menyusun drafnya.
              </span>
            </span>
          </button>
        )}
        <p className="rounded-2xl bg-surface px-3 py-2.5 text-[12px] leading-4 text-muted-foreground ring-1 ring-border/50">
          Buka perjalananmu lalu pilih <b>Jadikan template</b> untuk menerbitkan agendanya.{" "}
          {affiliate.programOn ? (
            affiliate.code ? (
              <>
                Tautan template otomatis membawa kode affiliate-mu. Teman yang mendaftar dan membeli
                lewat tautan itu memberimu komisi {affiliate.commissionPercent}%.{" "}
                {data.referrals > 0 && <b>{data.referrals} teman bergabung.</b>}
              </>
            ) : (
              <>
                <Link to="/affiliate" className="font-semibold text-brand-red">
                  Aktifkan affiliate
                </Link>{" "}
                supaya tautan template-mu menghasilkan komisi saat teman membeli.
              </>
            )
          ) : null}
        </p>
        {data.templates.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            Belum ada template. Mulai dari perjalananmu atau minta Travo.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.templates.map((t) => (
              <li key={t.id} className="rounded-2xl bg-surface p-3 ring-1 ring-border/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to="/template/$slug"
                      params={{ slug: t.slug }}
                      className="line-clamp-2 text-[14px] font-semibold leading-[18px]"
                    >
                      {t.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t.destinationName} · {t.days} hari · v{t.version}
                      {t.source === "travo" ? " · Travo" : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      t.status === "published"
                        ? "bg-emerald-500/15 text-emerald-700"
                        : t.status === "hidden"
                          ? "bg-red-500/15 text-red-700"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {STATUS[t.status] ?? t.status}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {t.views} dilihat · {t.uses} dipakai
                </p>
                {t.hiddenReason && (
                  <p className="mt-1 text-[11px] text-red-700">Alasan: {t.hiddenReason}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.status === "published" && (
                    <Chip
                      onClick={() => void share(t.slug, t.title)}
                      icon={Share2}
                      label="Bagikan"
                    />
                  )}
                  {t.status === "published" && (
                    <Chip
                      onClick={async () => {
                        await navigator.clipboard.writeText(linkFor(t.slug)).catch(() => undefined);
                        toast.success("Tautan disalin");
                      }}
                      icon={Copy}
                      label="Salin"
                    />
                  )}
                  {t.hasSourceTrip && t.status !== "hidden" && (
                    <Chip
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => refreshTemplate({ data: { id: t.id } }),
                          "Template diperbarui",
                        )
                      }
                      icon={RefreshCw}
                      label="Perbarui dari perjalanan"
                    />
                  )}
                  {t.status !== "hidden" && (
                    <Chip
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            updateTemplate({
                              data: {
                                id: t.id,
                                title: t.title,
                                status: t.status === "published" ? "unpublished" : "published",
                              },
                            }),
                          t.status === "published"
                            ? "Template dinonaktifkan"
                            : "Template tayang lagi",
                        )
                      }
                      icon={t.status === "published" ? EyeOff : Eye}
                      label={t.status === "published" ? "Nonaktifkan" : "Tayangkan"}
                    />
                  )}
                  <Chip
                    disabled={busy}
                    onClick={() => setRemove(t.id)}
                    icon={Trash2}
                    label="Hapus"
                    danger
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link to="/my-trips" className={`${btnRed} w-full`}>
          Pilih perjalanan untuk dijadikan template
        </Link>
      </div>
      <TravoTemplateSheet open={travoOpen} onOpenChange={setTravoOpen} />
      <ConfirmDialog
        open={remove !== null}
        onOpenChange={(open) => !open && setRemove(null)}
        title="Hapus template?"
        description="Tautannya berhenti bekerja. Perjalanan yang sudah disalin orang lain tidak terpengaruh."
        confirmLabel="Hapus"
        destructive
        busy={busy}
        onConfirm={() => {
          const id = remove;
          setRemove(null);
          if (id) void run(() => deleteTemplate({ data: { id } }), "Template dihapus");
        }}
      />
    </Page>
  );
}

function Chip({
  onClick,
  icon: Icon,
  label,
  danger,
  disabled,
}: {
  onClick: () => void;
  icon: typeof Copy;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`tap inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-semibold disabled:opacity-50 ${
        danger ? "bg-red-500/10 text-red-700" : "bg-secondary text-secondary-foreground"
      }`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
