import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import type { ActivationStageState, ActivationTimeline } from "@/lib/travel-journey";
import { snapshotAgeLabel } from "@/lib/offline-travel-snapshot";

/** Minimum gap between two manual provider reads, so a tap-happy customer cannot spam it. */
export const REFRESH_COOLDOWN_MS = 15_000;

const CIRCLE_TONE: Record<ActivationStageState, string> = {
  done: "bg-success text-primary-foreground",
  current: "bg-primary text-primary-foreground",
  todo: "bg-secondary text-muted-foreground",
  failed: "bg-brand-red text-primary-foreground",
};

const STATE_WORD: Record<ActivationStageState, string> = {
  done: "selesai",
  current: "sedang berjalan",
  todo: "belum",
  failed: "gagal",
};

const HEADLINE_TONE: Record<ActivationTimeline["state"], string> = {
  in_progress: "text-foreground",
  ready: "text-success",
  active: "text-success",
  expired: "text-muted-foreground",
  failed: "text-brand-red",
  cancelled: "text-muted-foreground",
  refunded: "text-muted-foreground",
};

export function TravelTimeline({
  timeline,
  lastSyncedAt,
  syncFailed = false,
  onRefresh,
  compact = false,
}: {
  timeline: ActivationTimeline;
  lastSyncedAt?: number | null | undefined;
  syncFailed?: boolean | undefined;
  onRefresh?: (() => void | Promise<void>) | undefined;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const doneCount = timeline.stages.filter((stage) => stage.state === "done").length;
  const percent = Math.round((doneCount / timeline.stages.length) * 100);
  const cooling = cooldownUntil > Date.now();

  async function refresh() {
    if (!onRefresh || busy || Date.now() < cooldownUntil) return;
    setBusy(true);
    setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
    try {
      await onRefresh();
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section
      className={`rounded-2xl bg-surface ${compact ? "p-4" : "p-5"}`}
      data-testid="travel-timeline"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Status eSIM
          </p>
          <p className={`text-xl font-bold ${HEADLINE_TONE[timeline.state]}`}>
            {timeline.headline}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{timeline.hint}</p>
        </div>
        {compact && timeline.canRefresh && onRefresh && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy || cooling}
            className="tap flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-secondary px-3 text-[12px] font-semibold disabled:opacity-50"
          >
            <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden="true" />
            {busy ? "Cek…" : "Refresh"}
          </button>
        )}
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {doneCount} dari {timeline.stages.length} tahap selesai
      </p>

      <ol className="mt-5 grid grid-cols-4 gap-1">
        {timeline.stages.map((stage, index) => (
          <li
            key={stage.id}
            className="flex flex-col items-center text-center"
            aria-current={stage.state === "current" ? "step" : undefined}
          >
            <span
              className={`flex size-8 items-center justify-center rounded-full text-[13px] font-semibold ${CIRCLE_TONE[stage.state]}`}
              aria-hidden="true"
            >
              {stage.state === "done" ? (
                <Check className="size-4" strokeWidth={3} />
              ) : stage.state === "failed" ? (
                <AlertTriangle className="size-4" />
              ) : (
                index + 1
              )}
            </span>
            <span className="mt-2 text-[11px] font-medium leading-tight">{stage.label}</span>
            <span className="sr-only">{STATE_WORD[stage.state]}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-[12px] text-muted-foreground">
          {typeof lastSyncedAt === "number"
            ? `Terakhir diperbarui ${snapshotAgeLabel(lastSyncedAt)}`
            : "Belum pernah diperbarui"}
        </span>
        {!compact && onRefresh && timeline.canRefresh && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy || cooling}
            className="tap flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-[12px] font-semibold disabled:opacity-50"
          >
            <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden="true" />
            {busy ? "Memeriksa…" : "Perbarui status"}
          </button>
        )}
      </div>

      {syncFailed && (
        <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-[12px] text-muted-foreground">
          Status terbaru belum dapat dikonfirmasi. Yang tampil di sini adalah data terakhir yang
          kami terima.
        </p>
      )}
    </section>
  );
}
