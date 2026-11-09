import { useState } from "react";
import { GrowBar, useInView, useReducedMotion } from "@/components/admin-motion";
import type { Named, Point } from "@/lib/traffic-dashboard";

export const rupiahShort = (v: number) =>
  v >= 1_000_000
    ? `Rp ${(v / 1_000_000).toFixed(1).replace(".", ",")} jt`
    : v >= 1000
      ? `Rp ${Math.round(v / 1000)} rb`
      : `Rp ${v}`;

/** Ranked list: bars grow in, rows highlight on hover and keep the exact value readable. */
export function TrafficRows({
  rows,
  empty,
  money,
  percent,
}: {
  rows: (Named & { orders?: number })[];
  empty: string;
  money?: boolean;
  percent?: number[];
}) {
  if (rows.length === 0) return <p className="py-2 text-[11px] text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="mt-1 font-mono text-[11px]">
      {rows.map((r, i) => (
        <li
          key={`${r.label}-${i}`}
          className="group relative flex justify-between gap-2 px-1.5 py-1 transition-colors hover:bg-muted/50"
          title={`${r.label}: ${r.value.toLocaleString("id-ID")}`}
        >
          <span className="absolute inset-y-0.5 left-0 right-0 overflow-hidden" aria-hidden="true">
            <GrowBar
              percent={Math.max(3, (r.value / max) * 100)}
              delay={Math.min(i, 8) * 45}
              className="h-full bg-muted transition-[background-color] group-hover:bg-brand-red/15"
            />
          </span>
          <span className="relative min-w-0 truncate">
            {r.label}
            {r.tag && (
              <em className="ml-1.5 border border-border px-1 text-[8px] uppercase not-italic text-muted-foreground">
                {r.tag}
              </em>
            )}
          </span>
          <span className="relative shrink-0 text-muted-foreground transition-colors group-hover:text-foreground">
            {r.orders !== undefined && `${r.orders} pesanan · `}
            {money ? rupiahShort(r.value) : r.value.toLocaleString("id-ID")}
            {percent ? ` · ${percent[i]}%` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Stacked share bar. Hover a segment or a legend item to focus it and read its share. */
export function TrafficSplit({
  parts,
}: {
  parts: { label: string; value: number; color: string }[];
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const [active, setActive] = useState<number | null>(null);
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const focus = active === null ? null : parts[active];
  return (
    <>
      <div
        ref={ref}
        className="my-2 flex h-2.5 gap-px overflow-hidden bg-muted"
        role="img"
        aria-label="Pembagian lalu lintas"
        onMouseLeave={() => setActive(null)}
      >
        {parts.map(
          (p, i) =>
            total > 0 &&
            p.value > 0 && (
              <span
                key={p.label}
                onMouseEnter={() => setActive(i)}
                style={{
                  width: seen || reduced ? `${(p.value / total) * 100}%` : "0%",
                  background: p.color,
                  opacity: active === null || active === i ? 1 : 0.3,
                  transition: reduced
                    ? "none"
                    : `width 900ms cubic-bezier(0.22,1,0.36,1) ${i * 90}ms, opacity 150ms`,
                }}
              />
            ),
        )}
      </div>
      <p className="flex min-h-4 flex-wrap gap-x-3 text-[10px] text-muted-foreground">
        {parts.map((p, i) => (
          <button
            type="button"
            key={p.label}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className={`transition-opacity ${active !== null && active !== i ? "opacity-40" : ""}`}
          >
            <i
              className="mr-1 inline-block size-1.5 rounded-[1px]"
              style={{ background: p.color }}
            />
            {p.label} <b className="text-foreground">{p.value.toLocaleString("id-ID")}</b>{" "}
            {pct(p.value)}%
          </button>
        ))}
      </p>
      <p className="sr-only" aria-live="polite">
        {focus
          ? `${focus.label}: ${focus.value.toLocaleString("id-ID")}, ${pct(focus.value)} persen`
          : ""}
      </p>
    </>
  );
}

/**
 * Area line chart that draws in, then follows the pointer (or arrow keys) with a guide line,
 * a dot and a tooltip showing the exact value for that bucket.
 */
export function TrafficLine({
  points,
  color,
  height = 130,
  format,
}: {
  points: Point[];
  color: string;
  height?: number;
  format?: (v: number) => string;
}) {
  const W = 800;
  const H = height;
  const pad = 12;
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value), 1);
  const fmt = format ?? ((v: number) => v.toLocaleString("id-ID"));
  const xy = points.map(
    (p, i) =>
      [
        pad + (points.length > 1 ? (i * (W - 2 * pad)) / (points.length - 1) : 0),
        H - pad - (p.value / max) * (H - 2 * pad - 10),
      ] as const,
  );
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const total = points.reduce((s, p) => s + p.value, 0);
  if (total === 0)
    return (
      <p className="py-6 text-center text-[11px] text-muted-foreground">
        Belum ada data pada rentang ini.
      </p>
    );

  const indexAt = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const raw = ((svgX - pad) / (W - 2 * pad)) * (points.length - 1);
    return Math.max(0, Math.min(points.length - 1, Math.round(raw)));
  };
  const current = hover === null ? null : points[hover];
  const at = hover === null ? null : xy[hover];
  const leftPct = at ? (at[0] / W) * 100 : 0;
  return (
    <div className="mt-1.5">
      <div
        ref={ref}
        className="relative touch-pan-y outline-none focus-visible:ring-1 focus-visible:ring-brand-red"
        style={{ height }}
        tabIndex={0}
        role="img"
        aria-label={`Grafik, puncak ${fmt(max)}. Gunakan panah kiri dan kanan untuk membaca nilai.`}
        onPointerMove={(e) => setHover(indexAt(e.clientX, e.currentTarget))}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
          else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length) - 1));
          else if (e.key === "Escape") setHover(null);
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          style={{
            clipPath: seen || reduced ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
            transition: reduced ? "none" : "clip-path 1100ms cubic-bezier(0.22,1,0.36,1)",
          }}
          aria-hidden="true"
        >
          <line x1="0" x2={W} y1={H - pad} y2={H - pad} stroke="currentColor" strokeOpacity=".15" />
          {xy.length > 0 && (
            <path
              d={`${d} L${xy[xy.length - 1]![0]} ${H - pad} L${xy[0]![0]} ${H - pad}Z`}
              fill={color}
              opacity=".12"
            />
          )}
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {at && current && (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25"
              style={{ left: `${leftPct}%` }}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
              style={{ left: `${leftPct}%`, top: `${(at[1] / H) * 100}%`, background: color }}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap border border-border bg-card px-2 py-1 font-mono text-[10px] shadow-sm"
              style={{ left: `${Math.min(88, Math.max(12, leftPct))}%` }}
              role="status"
            >
              <b className="text-foreground">{fmt(current.value)}</b>{" "}
              <span className="text-muted-foreground">{current.label}</span>
            </span>
          </>
        )}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>puncak {fmt(max)}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
