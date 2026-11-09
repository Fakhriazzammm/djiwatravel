import type { Named, Point } from "@/lib/traffic-dashboard";

export const rupiahShort = (v: number) =>
  v >= 1_000_000
    ? `Rp ${(v / 1_000_000).toFixed(1).replace(".", ",")} jt`
    : v >= 1000
      ? `Rp ${Math.round(v / 1000)} rb`
      : `Rp ${v}`;

/** Ranked list with an in-row bar; `money` formats the value as rupiah. */
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
        <li key={`${r.label}-${i}`} className="relative flex justify-between gap-2 px-1.5 py-1">
          <span
            className="absolute inset-y-0.5 left-0 bg-muted"
            style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
            aria-hidden="true"
          />
          <span className="relative min-w-0 truncate">
            {r.label}
            {r.tag && (
              <em className="ml-1.5 border border-border px-1 text-[8px] uppercase not-italic text-muted-foreground">
                {r.tag}
              </em>
            )}
          </span>
          <span className="relative shrink-0 text-muted-foreground">
            {r.orders !== undefined && `${r.orders} pesanan · `}
            {money ? rupiahShort(r.value) : r.value.toLocaleString("id-ID")}
            {percent ? ` · ${percent[i]}%` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TrafficSplit({
  parts,
}: {
  parts: { label: string; value: number; color: string }[];
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <>
      <div
        className="my-2 flex h-2 gap-px overflow-hidden rounded-sm bg-muted"
        role="img"
        aria-label="Pembagian lalu lintas"
      >
        {parts.map(
          (p) =>
            total > 0 &&
            p.value > 0 && (
              <span
                key={p.label}
                style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
              />
            ),
        )}
      </div>
      <p className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
        {parts.map((p) => (
          <span key={p.label}>
            <i
              className="mr-1 inline-block size-1.5 rounded-[1px]"
              style={{ background: p.color }}
            />
            {p.label} <b className="text-foreground">{p.value.toLocaleString("id-ID")}</b>{" "}
            {total > 0 ? Math.round((p.value / total) * 100) : 0}%
          </span>
        ))}
      </p>
    </>
  );
}

/** Small area line chart; values are also readable in the table below for accessibility. */
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
  const W = 800,
    H = height,
    pad = 12;
  const max = Math.max(...points.map((p) => p.value), 1);
  const xy = points.map(
    (p, i) =>
      [
        pad + (points.length > 1 ? (i * (W - 2 * pad)) / (points.length - 1) : 0),
        H - pad - (p.value / max) * (H - 2 * pad - 10),
      ] as const,
  );
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const total = points.reduce((s, p) => s + p.value, 0);
  const fmt = format ?? ((v: number) => v.toLocaleString("id-ID"));
  return (
    <div className="mt-1.5">
      {total === 0 ? (
        <p className="py-6 text-center text-[11px] text-muted-foreground">
          Belum ada data pada rentang ini.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={`Grafik, puncak ${fmt(max)}`}
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
      )}
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>puncak {fmt(max)}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
