import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  TrafficLine,
  TrafficRows,
  TrafficSplit,
  rupiahShort,
} from "@/components/admin-traffic-parts";
import {
  TRAFFIC_RANGES,
  TRAFFIC_RANGE_LABEL,
  type TrafficDashboard,
  type TrafficRange,
} from "@/lib/traffic-dashboard";
import { channelPercent } from "@/lib/traffic-view";
import { formatRupiah, percentChange } from "@/lib/admin-dashboard-metrics";
import { BOT_KIND_LABEL, clickThroughPer100, type BotKind } from "@/lib/traffic-census";

const id = (v: number) => v.toLocaleString("id-ID");
const MONO = "font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground";

/** Flat bordered block: data first, no rounded cards or shadows. */
function Block({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-border bg-card ${className}`}>{children}</div>;
}
function Cap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`${MONO} ${className}`}>{children}</p>;
}
function Heading({ children, tone }: { children: ReactNode; tone?: "ai" | "sales" }) {
  const dot =
    tone === "ai" ? "bg-emerald-600" : tone === "sales" ? "bg-brand-red" : "bg-foreground";
  return (
    <h2 className={`${MONO} mb-2 mt-7 flex items-center gap-1.5 text-foreground`}>
      <span className={`size-1.5 ${dot}`} aria-hidden="true" />
      {children}
    </h2>
  );
}
function Stat({ value, label, hint }: { value: string; label: string; hint?: ReactNode }) {
  return (
    <div className="min-w-0 border-r border-border p-3 last:border-r-0">
      <p className="truncate text-2xl font-bold leading-none tabular-nums">{value}</p>
      <Cap className="mt-2">{label}</Cap>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
function Delta({ now, before }: { now: number; before: number }) {
  const v = percentChange(now, before);
  if (v === null) return <>baru</>;
  return (
    <span className={v < 0 ? "text-destructive" : "text-emerald-600"}>
      {v < 0 ? "▼" : "▲"} {Math.abs(v)}% vs sebelumnya
    </span>
  );
}

export type DashboardAlert = { key: string; text: string; href: string; danger: boolean };

export function TrafficPanel({
  data,
  range,
  alerts,
  providerLabel,
}: {
  data: TrafficDashboard | null;
  range: TrafficRange;
  alerts: DashboardAlert[];
  providerLabel: string;
}) {
  if (!data) {
    return (
      <Block className="p-4 text-sm text-muted-foreground">
        Data lalu lintas belum tersedia. Pastikan migrasi 057 sudah diterapkan.
      </Block>
    );
  }
  const label = TRAFFIC_RANGE_LABEL[range];
  const s = data.sales;
  const funnelMax = Math.max(...s.funnel.map((f) => f.value), 1);
  const ctr = clickThroughPer100(data.kinds.aiClicks, data.kinds.aiAnswers);
  const actions = [
    ...alerts.map((a) => ({
      label: a.text,
      href: a.href,
      n: null as number | null,
      danger: a.danger,
    })),
    ...s.actions.map((a) => ({ label: a.label, href: a.href, n: a.value, danger: a.value > 0 })),
  ].filter((a) => a.n === null || a.n > 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="inline-flex border border-border" aria-label="Rentang waktu">
          {TRAFFIC_RANGES.map((r) => (
            <Link
              key={r}
              to="/admin/dashboard"
              search={{ range: r } as never}
              aria-current={r === range ? "page" : undefined}
              className={`px-3 py-1.5 ${MONO} ${r === range ? "bg-foreground text-background" : ""}`}
            >
              {TRAFFIC_RANGE_LABEL[r]}
            </Link>
          ))}
        </nav>
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-600" aria-hidden="true" />
          <b className="text-foreground">{data.live.online} online</b> · saldo provider{" "}
          {providerLabel}
        </p>
      </div>

      <Block className="mt-3 grid grid-cols-[110px_1fr]">
        <div className="border-r border-border p-3">
          <p className="text-5xl font-bold leading-none tabular-nums">{data.live.online}</p>
          <Cap className="mt-2">Orang membaca sekarang</Cap>
        </div>
        <div className="p-3">
          <Cap>Yang sedang dibuka</Cap>
          <TrafficRows rows={data.live.paths} empty="Tidak ada pembaca dalam 5 menit terakhir." />
        </div>
      </Block>

      <Heading tone="sales">Penjualan · {label}</Heading>
      <Block className="grid grid-cols-2 md:grid-cols-4">
        <Stat
          value={formatRupiah(s.revenue)}
          label="Pendapatan terbayar"
          hint={range === "all" ? undefined : <Delta now={s.revenue} before={s.previousRevenue} />}
        />
        <Stat
          value={id(s.orders)}
          label="Pesanan dibayar"
          hint={range === "all" ? undefined : <Delta now={s.orders} before={s.previousOrders} />}
        />
        <Stat value={formatRupiah(s.aov)} label="Rata-rata per pesanan" />
        <Stat
          value={s.conversionPct === null ? "—" : `${s.conversionPct}%`}
          label="Konversi ke bayar"
          hint={`${id(s.visitors)} pengunjung`}
        />
      </Block>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Block className="p-3">
          <Cap>Pendapatan · {label}</Cap>
          <TrafficLine points={data.series.revenue} color="#d92b2b" format={rupiahShort} />
        </Block>
        <Block className="p-3">
          <Cap>Corong: pembaca sampai bayar</Cap>
          <div className="mt-2 space-y-2">
            {s.funnel.map((f, i) => (
              <div key={f.label} className="text-[11px]">
                <div className="flex justify-between">
                  <span>{f.label}</span>
                  <b className="font-mono tabular-nums">
                    {id(f.value)}
                    {i > 0 && s.funnel[0]!.value > 0
                      ? ` · ${Math.round((f.value / s.funnel[0]!.value) * 100)}%`
                      : ""}
                  </b>
                </div>
                <div className="mt-0.5 h-1.5 bg-muted">
                  <div
                    className="h-1.5 bg-brand-red"
                    style={{ width: `${Math.max(2, (f.value / funnelMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Block>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Block className="p-3">
          <Cap>Per produk</Cap>
          <TrafficRows rows={s.byProduct} money empty="Belum ada penjualan." />
        </Block>
        <Block className="p-3">
          <Cap>Per asal pengunjung</Cap>
          <TrafficRows rows={s.bySource} money empty="Belum ada penjualan." />
        </Block>
        <Block className="p-3">
          <Cap>Per halaman checkout</Cap>
          <TrafficRows rows={s.byPage} money empty="Belum ada penjualan." />
        </Block>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_280px]">
        <Block className="overflow-x-auto p-3">
          <Cap>Pesanan terbaru</Cap>
          {s.recent.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">Belum ada pesanan dibayar.</p>
          ) : (
            <table className="mt-1 w-full font-mono text-[11px]">
              <tbody>
                {s.recent.map((r, i) => (
                  <tr key={i} className="border-t border-border first:border-0">
                    <td className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground">
                      {new Date(r.at).toLocaleString("id-ID", {
                        timeZone: "Asia/Jakarta",
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="pr-3">{r.label}</td>
                    <td className="pr-3 text-muted-foreground">{r.source}</td>
                    <td className="text-right tabular-nums">{formatRupiah(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Block>
        <Block className="p-3">
          <Cap>Perlu tindakan</Cap>
          {actions.length === 0 ? (
            <p className="py-2 text-[11px] text-emerald-600">Semua normal.</p>
          ) : (
            <ul className="mt-1 divide-y divide-border text-[11px]">
              {actions.map((a) => (
                <li key={a.label}>
                  <Link to={a.href as never} className="flex justify-between gap-2 py-1.5">
                    <span>{a.label}</span>
                    {a.n !== null && (
                      <b className={`font-mono ${a.danger ? "text-brand-red" : ""}`}>{a.n}</b>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      <Heading>Total halaman dibaca</Heading>
      {(
        [
          ["24 jam terakhir", data.total24h],
          ["Sejak data pertama", data.totalAll],
        ] as const
      ).map(([title, t]) => (
        <Block key={title} className="mb-3 p-3">
          <p className="text-3xl font-bold leading-none tabular-nums">
            {id(t.people + t.aiAnswers + t.aiCrawl + t.searchEngine)}{" "}
            <span className={MONO}>{title}</span>
          </p>
          <TrafficSplit
            parts={[
              { label: "Orang", value: t.people, color: "#3b6a99" },
              { label: "Jawaban AI", value: t.aiAnswers, color: "#2f9e6a" },
              { label: "Pencarian & pelatihan AI", value: t.aiCrawl, color: "#8fcfae" },
              { label: "Mesin pencari", value: t.searchEngine, color: "#b9bcc4" },
            ]}
          />
        </Block>
      ))}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Heading>Orang</Heading>
          <Block className="grid grid-cols-3">
            <Stat value={id(data.people.views24h)} label="Tampilan · 24 jam" />
            <Stat value={id(data.people.visitors24h)} label="Pengunjung · 24 jam" />
            <Stat value={id(data.people.viewsAll)} label="Tampilan · semua" />
          </Block>
        </div>
        <div>
          <Heading tone="ai">AI</Heading>
          <Block className="grid grid-cols-3">
            <Stat value={id(data.ai.answers24h)} label="Jawaban AI · 24 jam" />
            <Stat value={id(data.ai.crawls24h)} label="Perayapan AI · 24 jam" />
            <Stat value={id(data.ai.answersAll)} label="Jawaban AI · semua" />
          </Block>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <Block className="p-3">
          <Cap>Orang · tampilan halaman · {label}</Cap>
          <TrafficLine points={data.series.people} color="#3b6a99" />
        </Block>
        <Block className="p-3">
          <Cap>Jawaban AI · {label}</Cap>
          <TrafficLine points={data.series.aiAnswers} color="#2f9e6a" />
        </Block>
      </div>

      <Heading>Orang · {label}</Heading>
      <Block className="grid md:grid-cols-2">
        <div className="border-b border-border p-3 md:border-b-0 md:border-r">
          <Cap>Halaman paling banyak dibaca</Cap>
          <TrafficRows rows={data.pages} empty="Belum ada data." />
        </div>
        <div className="p-3">
          <Cap>Asal kedatangan</Cap>
          <TrafficRows rows={data.referrers} empty="Belum ada data." />
        </div>
      </Block>
      <Block className="mt-3 grid md:grid-cols-2">
        <div className="border-b border-border p-3 md:border-b-0 md:border-r">
          <Cap>Kanal</Cap>
          <TrafficRows
            rows={data.channels}
            empty="Belum ada data."
            percent={channelPercent(data.channels)}
          />
        </div>
        <div className="p-3">
          <Cap>Perangkat</Cap>
          <TrafficRows rows={data.devices} empty="Belum ada data." />
        </div>
      </Block>

      <Heading tone="ai">AI · {label}</Heading>
      <Block className="grid md:grid-cols-2">
        <div className="border-b border-border p-3 md:border-b-0 md:border-r">
          <Cap>Asisten yang menjawab seseorang dengan halaman ini</Cap>
          <TrafficRows rows={data.assistants} empty="Belum ada jawaban AI." />
        </div>
        <div className="p-3">
          <Cap>Halaman yang paling sering dibuka asisten</Cap>
          <TrafficRows rows={data.aiPages} empty="Belum ada data." />
        </div>
      </Block>
      <Block className="mt-3 p-3">
        <Cap>Orang yang klik dari jawaban AI · {label}</Cap>
        <TrafficLine points={data.series.aiClicks} color="#2f9e6a" height={90} />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {ctr === null
            ? "Belum ada jawaban AI untuk dibandingkan."
            : `${id(data.kinds.aiClicks)} orang tiba dari asisten AI, sekitar ${ctr} per 100 jawaban.`}
        </p>
      </Block>
      <Block className="mt-3 grid md:grid-cols-2">
        <div className="border-b border-border p-3 md:border-b-0 md:border-r">
          <Cap>Perayap: pencarian AI, pelatihan, mesin pencari</Cap>
          <TrafficRows
            rows={data.crawlers.map((c) =>
              c.tag ? { ...c, tag: BOT_KIND_LABEL[c.tag as BotKind] ?? c.tag } : c,
            )}
            empty="Belum ada perayap tercatat."
          />
        </div>
        <div className="p-3">
          <Cap>Menurut jenis</Cap>
          <dl className="mt-2 space-y-2 text-[11px]">
            {[
              [data.kinds.aiAnswers, "Jawaban AI"],
              [data.kinds.aiClicks, "Orang tiba dari jawaban AI"],
              [data.kinds.aiCrawl, "Perayapan pencarian AI"],
              [data.kinds.aiTrain, "Perayapan pelatihan AI"],
              [data.kinds.searchEngine, "Perayapan mesin pencari"],
            ].map(([v, l]) => (
              <div key={String(l)} className="flex items-baseline gap-3">
                <dt className="w-14 text-xl font-bold tabular-nums">{id(Number(v))}</dt>
                <dd className="text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Block>

      <Block className="mt-3 p-3 text-[11px] text-muted-foreground">
        <b className="text-foreground">Tidak dihitung · {label}:</b> {id(data.notCounted)}{" "}
        permintaan otomatis tanpa identitas dikenal (curl, scraper, tanpa identitas).
      </Block>
      <details className="mt-3 border border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground">
        <summary className={`${MONO} cursor-pointer`}>Cara angka ini dihitung</summary>
        <p className="mt-2">
          Orang: tampilan halaman dari browser yang menjalankan skrip situs; pengunjung = satu sesi
          browser, tanpa IP. Jawaban AI: halaman dibuka fetcher asisten (ChatGPT-User, Claude-User,
          Perplexity-User) saat menjawab seseorang. Perayap dan mesin pencari dihitung terpisah;
          nama bot adalah klaim identitas, belum dibuktikan lewat alamat jaringan.
        </p>
        <p className="mt-2">
          Penjualan: hanya pesanan yang sudah dibayar (eSIM, preorder, Titip Belanja), sama dengan
          Keuangan. Asal diambil dari sesi browser saat pesanan dibuat; tanpa itu tampil "Tidak
          terlacak". Semua waktu WIB.
        </p>
      </details>
    </div>
  );
}
