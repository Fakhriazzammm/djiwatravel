import { AlertTriangle, Gauge } from "lucide-react";
import { formatData, formatGb, formatRemainingPercent, type UsageView } from "@/lib/travel-journey";
import { QuotaRing } from "@/components/esim-quota-ring";
import { snapshotAgeLabel } from "@/lib/offline-travel-snapshot";

export function TravelUsageCard({ view, compact = false }: { view: UsageView; compact?: boolean }) {
  const measuredAtLabel =
    typeof view.measuredAt === "number" ? snapshotAgeLabel(view.measuredAt) : null;

  return (
    <section
      className={`rounded-2xl bg-surface ${compact ? "p-4" : "p-5"}`}
      data-testid="travel-usage"
    >
      <div className="flex items-center gap-2">
        <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-base font-semibold">Pemakaian kuota</h2>
      </div>

      {view.kind === "measured" &&
      view.remainingBytes !== null &&
      view.remainingPercent !== null ? (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className={`${compact ? "text-xl" : "text-[28px]"} font-bold`}>
                {formatData(view.remainingBytes)}
              </p>
              <p className="text-sm text-muted-foreground">
                tersisa dari {formatGb(view.totalBytes ?? 0)}
              </p>
            </div>
            <QuotaRing
              percent={view.remainingPercent}
              label={formatRemainingPercent(view)}
              valueText={`Sisa ${formatData(view.remainingBytes)} (${formatRemainingPercent(view)})`}
              low={view.low}
              size={64}
            />
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Sisa {formatRemainingPercent(view)} · terpakai {formatGb(view.usedBytes ?? 0)}
          </p>

          {view.low && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-brand-red-soft px-3 py-2 text-[12px] font-medium text-brand-red">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Kuota tinggal {formatRemainingPercent(view)}. Siapkan paket tambahan sebelum kuota
              habis.
            </p>
          )}
        </>
      ) : view.kind === "unlimited" ? (
        <>
          <p className={`${compact ? "text-xl" : "text-[28px]"} mt-3 font-bold`}>Unlimited</p>
          <p className="text-sm text-muted-foreground">
            {view.usedBytes !== null ? `Terpakai ${formatGb(view.usedBytes)}` : view.note}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{view.note}</p>
      )}

      {measuredAtLabel && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Pembacaan penyedia {measuredAtLabel}
        </p>
      )}
      {view.kind === "measured" &&
        view.remainingPercent !== null &&
        view.remainingPercent > view.lowThreshold && (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Angka ini dari penyedia eSIM, bukan perkiraan aplikasi.
          </p>
        )}
    </section>
  );
}
