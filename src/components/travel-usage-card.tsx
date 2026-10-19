import { AlertTriangle, Gauge } from "lucide-react";
import { formatGb, LOW_QUOTA_PERCENT, type UsageView } from "@/lib/travel-journey";
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
          <p className={`${compact ? "text-2xl" : "text-3xl"} mt-3 font-bold`}>
            {formatGb(view.remainingBytes)}
          </p>
          <p className="text-sm text-muted-foreground">
            tersisa dari {formatGb(view.totalBytes ?? 0)}
          </p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full ${view.low ? "bg-brand-red" : "bg-primary"}`}
              style={{ width: `${view.remainingPercent}%` }}
            />
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Sisa {view.remainingPercent}% · terpakai {formatGb(view.usedBytes ?? 0)}
          </p>

          {view.low && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-brand-red-soft px-3 py-2 text-[12px] font-medium text-brand-red">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Kuota tinggal {view.remainingPercent}%. Siapkan paket tambahan sebelum kuota habis.
            </p>
          )}
        </>
      ) : view.kind === "unlimited" ? (
        <>
          <p className={`${compact ? "text-2xl" : "text-3xl"} mt-3 font-bold`}>Unlimited</p>
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
        view.remainingPercent > LOW_QUOTA_PERCENT && (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Angka ini dari penyedia eSIM, bukan perkiraan aplikasi.
          </p>
        )}
    </section>
  );
}
