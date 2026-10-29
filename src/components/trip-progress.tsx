import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";

export function TripProgress({
  percent,
  completed,
  total,
  nextLabel,
  nextSection,
  tripId,
}: {
  percent: number;
  completed: number;
  total: number;
  nextLabel: string;
  nextSection: string | null;
  tripId: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-xl bg-brand-red-soft text-brand-red">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Trip makin siap</p>
          <p className="text-xs text-muted-foreground">
            {completed} dari {total} langkah utama
          </p>
        </div>
        <span className="text-sm font-bold tabular-nums text-brand-red">{percent}%</span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label="Progres kesiapan perjalanan"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-brand-red transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-[13px] font-medium">
        <span className="min-w-0 flex-1">{nextLabel}</span>
        {nextSection && <ArrowRight className="size-4 text-brand-red" />}
      </div>
    </>
  );
  const className = "block rounded-2xl bg-surface p-4 ring-1 ring-border/60";
  return completed === total ? (
    <section className={className}>{body}</section>
  ) : nextSection ? (
    <Link
      to="/my-trips/$tripId/$section"
      params={{ tripId, section: nextSection }}
      className={`${className} tap active:bg-secondary/50`}
    >
      {body}
    </Link>
  ) : (
    <Link
      to="/my-trips/$tripId"
      params={{ tripId }}
      className={`${className} tap active:bg-secondary/50`}
    >
      {body}
    </Link>
  );
}
