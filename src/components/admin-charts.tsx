import { Link } from "@tanstack/react-router";
import { AdminSurface } from "@/components/admin-shell";
import { projectAdminTitle } from "@/lib/admin-display";
import { barPercent } from "@/lib/admin-dashboard-metrics";

export type ChartPoint = { key: string; label: string; value: number; display: string };

/** Compact card title: one line, optional right-aligned slot. */
export function CardTitle({
  title,
  detail,
  right,
}: {
  title: string;
  detail?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="truncate text-xs font-semibold">{title}</h2>
        {detail && <p className="truncate text-[10px] text-muted-foreground">{detail}</p>}
      </div>
      {right}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  tone?: "neutral" | "warn";
  href?: string;
}) {
  const body = (
    <div
      className={`h-full rounded-xl px-2.5 py-1.5 ${tone === "warn" ? "bg-[#fffaf0]" : "bg-surface"}`}
    >
      <p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-lg font-bold leading-tight tabular-nums">{value}</p>
      <div className="truncate text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
  return href ? (
    <Link to={href as never} className="block min-w-0 hover:opacity-90">
      {body}
    </Link>
  ) : (
    <div className="min-w-0">{body}</div>
  );
}

/** Bar chart that fills its parent's height. Values stay in a popover table for accessibility. */
export function BarChart({
  title,
  summary,
  points,
  privateMode,
  emptyText,
  actions,
}: {
  title: string;
  summary: string;
  points: ChartPoint[];
  privateMode: boolean;
  emptyText: string;
  actions?: React.ReactNode;
}) {
  const max = Math.max(...points.map((p) => p.value), 0);
  const peak = points.find((p) => p.value === max && max > 0);
  const step = Math.max(1, Math.ceil(points.length / 8));
  return (
    <AdminSurface className="flex min-h-[220px] flex-col p-2.5 lg:min-h-0">
      <CardTitle
        title={title}
        detail={summary}
        right={
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            {points.length > 0 ? (
              <details className="relative shrink-0">
                <summary className="cursor-pointer select-none rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary">
                  Tabel
                </summary>
                <div className="absolute right-0 top-6 z-20 max-h-56 w-48 divide-y overflow-auto rounded-xl border border-border bg-surface p-2 text-[11px] shadow-lg">
                  {points.map((point) => (
                    <div key={point.key} className="flex justify-between gap-2 py-1">
                      <span>{point.label}</span>
                      <span className="font-semibold tabular-nums">
                        {privateMode ? "••" : point.display}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        }
      />
      {points.length ? (
        <div className="mt-1.5 flex min-h-0 flex-1 flex-col">
          <div
            className="relative flex min-h-0 flex-1 items-end gap-[3px] border-b border-border"
            role="img"
            aria-label={`${title}: ${points.length} titik data`}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-border/60"
              aria-hidden="true"
            />
            {points.map((point) => (
              <div
                key={point.key}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                title={projectAdminTitle(`${point.label}: ${point.display}`, privateMode)}
              >
                <div
                  className="w-full max-w-7 rounded-t bg-brand-red"
                  style={{
                    height: privateMode
                      ? "4px"
                      : point.value > 0
                        ? `${barPercent(point.value, max)}%`
                        : "2px",
                    opacity: point.value > 0 ? 1 : 0.25,
                  }}
                />
                {peak?.key === point.key && (
                  <span className="pointer-events-none absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap text-[10px] font-semibold tabular-nums">
                    {privateMode ? "••" : point.display}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[3px]">
            {points.map((point, index) => (
              <span
                key={point.key}
                className="min-w-0 flex-1 truncate text-center text-[9px] text-muted-foreground"
              >
                {index % step === 0 ? point.label : ""}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{emptyText}</p>
      )}
    </AdminSurface>
  );
}

export function ShareRow({
  label,
  value,
  share,
  masked,
  tone = "brand",
}: {
  label: string;
  value: string;
  share: number | null;
  masked: boolean;
  tone?: "brand" | "muted";
}) {
  return (
    <div className="text-[11px]">
      <div className="flex justify-between gap-2">
        <span className="min-w-0 truncate">{label}</span>
        <b className="shrink-0 tabular-nums">{value}</b>
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full ${tone === "brand" ? "bg-brand-red" : "bg-muted-foreground/60"}`}
          style={{ width: masked ? "4px" : `${Math.max(share ?? 0, share ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}
