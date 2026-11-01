import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { AdminHomePackageHighlights } from "@/components/admin-home-package-highlights";
import { EsimHomeSummaryCard } from "@/components/esim-home-summary-card";
import { destinations as catalog } from "@/lib/catalog";
import { saveHomeEsimConfig } from "@/lib/home-esim-config.fn";
import {
  LOW_QUOTA_MAX,
  LOW_QUOTA_MIN,
  PROMO_TEXT_MAX,
  activeHomePromo,
  orderHomeDestinations,
  parseHomeEsimConfig,
  type HomeEsimConfig,
} from "@/lib/home-esim-config";

type RailDestination = { code: string; flag: string; nameId: string };

/** ISO → value for <input type="datetime-local"> in the admin's own timezone. */
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const fromLocalInput = (value: string): string | undefined =>
  value ? new Date(value).toISOString() : undefined;

/**
 * Admin control for the Home eSIM card. It edits the same `homeEsim` record the customer Home
 * reads, and previews it with the real customer card (no second rendering of the card).
 */
export function AdminHomeEsimPanel({
  initial,
  version: initialVersion,
  railPool,
}: {
  initial: HomeEsimConfig;
  version: number;
  /** The live Home feed the rail is drawn from; pinned codes outside it are ignored by Home. */
  railPool: RailDestination[];
}) {
  const [draft, setDraft] = useState<HomeEsimConfig>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const ordered = orderHomeDestinations(railPool, draft.destinationOrder);
  const move = (index: number, delta: number) => {
    const codes = ordered.map((item) => item.code.toUpperCase());
    const target = index + delta;
    if (target < 0 || target >= codes.length) return;
    [codes[index], codes[target]] = [codes[target]!, codes[index]!];
    setDraft({ ...draft, destinationOrder: codes });
  };
  const promoLive = activeHomePromo(draft, Date.now()) !== null;

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const config = parseHomeEsimConfig(draft);
      const result = await saveHomeEsimConfig({
        data: { config, reason, expectedVersion: version },
      });
      if (!result.ok) {
        setVersion(result.version);
        setStatus({
          kind: "error",
          message: "Pengaturan sudah diubah admin lain. Muat ulang halaman, lalu coba lagi.",
        });
        return;
      }
      setVersion(result.version);
      setStatus({ kind: "ok" });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Gagal menyimpan. Tidak ada yang berubah.",
      });
    }
  };

  const field = "min-h-11 rounded-xl border border-border bg-surface px-3 text-sm";

  return (
    <div className="space-y-2" data-testid="admin-home-esim-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="eSIM Beranda"
          detail="Mengatur kartu eSIM, rel destinasi, ambang kuota, dan banner promo di Beranda."
        />
        <StatusPill tone={promoLive ? "good" : "warn"}>
          {promoLive ? "Promo tayang" : "Tanpa promo"}
        </StatusPill>
      </div>
      <AdminSurface className="space-y-4 p-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.quickBuyEnabled}
            onChange={(event) => setDraft({ ...draft, quickBuyEnabled: event.target.checked })}
            className="size-5 accent-primary"
          />
          Beli cepat (rel destinasi + paket Terlaris/Best Deal di kartu)
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.myTripsWidgetEnabled}
            onChange={(event) => setDraft({ ...draft, myTripsWidgetEnabled: event.target.checked })}
            className="size-5 accent-primary"
          />
          Widget Perjalananmu (My Trips) di Beranda
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.multiCountryEnabled}
            onChange={(event) => setDraft({ ...draft, multiCountryEnabled: event.target.checked })}
            className="size-5 accent-primary"
          />
          Paket multi-negara (Asia, Eropa, Global) di Beranda, Finder, dan halaman destinasi
        </label>
        <p className="-mt-2 text-xs text-muted-foreground">
          Data langsung dari katalog eSIM Access: paket yang mencakup lebih dari satu negara dan
          stoknya tersedia. Mematikan ini hanya menyembunyikan tampilannya; paket tetap bisa dibeli
          lewat tautan langsung.
        </p>

        <div>
          <p className="text-sm font-semibold">Urutan rel destinasi</p>
          <p className="text-xs text-muted-foreground">
            Dari feed live Beranda. Urutan tersimpan menjadi urutan di Beranda.
          </p>
          <ol className="mt-2 divide-y divide-border rounded-xl bg-secondary/50">
            {ordered.map((item, index) => (
              <li key={item.code} className="flex min-h-11 items-center gap-2 px-3 text-sm">
                <span aria-hidden="true">{item.flag}</span>
                <span className="min-w-0 flex-1 truncate">{item.nameId}</span>
                <button
                  type="button"
                  aria-label={`Naikkan ${item.nameId}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="grid size-9 place-items-center rounded-lg disabled:opacity-30"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Turunkan ${item.nameId}`}
                  disabled={index === ordered.length - 1}
                  onClick={() => move(index, 1)}
                  className="grid size-9 place-items-center rounded-lg disabled:opacity-30"
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
            {ordered.length === 0 && (
              <li className="px-3 py-3 text-xs text-muted-foreground">
                Feed destinasi belum tersedia.
              </li>
            )}
          </ol>
        </div>

        <label className="block text-sm font-semibold">
          Ambang kuota menipis ({draft.lowQuotaPercent}%)
          <input
            type="range"
            min={LOW_QUOTA_MIN}
            max={LOW_QUOTA_MAX}
            value={draft.lowQuotaPercent}
            onChange={(event) =>
              setDraft({ ...draft, lowQuotaPercent: Number(event.target.value) })
            }
            className="mt-2 block w-full accent-primary"
          />
          <span className="text-xs font-normal text-muted-foreground">
            Berlaku di Beranda, daftar eSIM, dan detail eSIM.
          </span>
        </label>

        <AdminHomePackageHighlights
          destinations={ordered}
          draft={draft}
          onChange={(packageHighlights) => setDraft({ ...draft, packageHighlights })}
        />

        <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Banner promo</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft.promo.enabled}
              onChange={(event) =>
                setDraft({ ...draft, promo: { ...draft.promo, enabled: event.target.checked } })
              }
              className="size-5 accent-primary"
            />
            Tampilkan banner
          </label>
          <input
            aria-label="Teks promo"
            maxLength={PROMO_TEXT_MAX}
            value={draft.promo.text}
            onChange={(event) =>
              setDraft({ ...draft, promo: { ...draft.promo, text: event.target.value } })
            }
            placeholder="Promo Jepang · diskon 10% s/d 7 Nov"
            className={`${field} w-full`}
          />
          <select
            aria-label="Destinasi promo"
            value={draft.promo.destinationCode ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                promo: { ...draft.promo, destinationCode: event.target.value || undefined },
              })
            }
            className={`${field} w-full`}
          >
            <option value="">Buka pencarian (tanpa destinasi)</option>
            {catalog.map((item) => (
              <option key={item.code} value={item.code.toUpperCase()}>
                {item.flag} {item.nameId}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">
              Mulai
              <input
                type="datetime-local"
                value={toLocalInput(draft.promo.startsAt)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    promo: { ...draft.promo, startsAt: fromLocalInput(event.target.value) },
                  })
                }
                className={`${field} mt-1 w-full`}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Selesai
              <input
                type="datetime-local"
                value={toLocalInput(draft.promo.endsAt)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    promo: { ...draft.promo, endsAt: fromLocalInput(event.target.value) },
                  })
                }
                className={`${field} mt-1 w-full`}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Jadwal dinilai di server. Promo hanya tampil di Beranda, tidak dikirim lewat notifikasi
            operasional. Ketukan rel, sheet, dan promo dicatat anonim; corongnya ada di Admin →
            Analytics.
          </p>
        </fieldset>

        <div>
          <p className="mb-2 text-sm font-semibold">
            Pratinjau kartu pelanggan (belum punya eSIM; paket & checkout tidak dibuka di pratinjau)
          </p>
          <div className="rounded-2xl bg-background p-3">
            <EsimHomeSummaryCard
              orders={[]}
              onSearchPackages={() => undefined}
              destinations={ordered}
              config={draft}
              readOnly
            />
            {activeHomePromo(draft, Date.now()) && (
              <p className="mt-2.5 rounded-2xl border border-border/60 bg-surface px-4 py-3 text-[13px] font-semibold">
                {draft.promo.text}
              </p>
            )}
          </div>
        </div>

        <label className="block text-sm font-semibold">
          Alasan perubahan (masuk audit log)
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={`${field} mt-1 w-full font-normal`}
            maxLength={300}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={status.kind === "saving" || reason.trim().length < 4}
            className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {status.kind === "saving" ? "Menyimpan…" : "Simpan"}
          </button>
          <p role="status" className="text-sm text-muted-foreground">
            {status.kind === "ok" &&
              "Tersimpan. Beranda memakai pengaturan ini di muat berikutnya."}
            {status.kind === "error" && status.message}
          </p>
        </div>
      </AdminSurface>
    </div>
  );
}
