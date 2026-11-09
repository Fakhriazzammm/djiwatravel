import { Link } from "@tanstack/react-router";
import { AdminSurface } from "@/components/admin-shell";
import { CardTitle, Kpi } from "@/components/admin-charts";
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
import { channelPercent, formatAdminDateTime } from "@/lib/traffic-view";
import { formatRupiah, percentChange } from "@/lib/admin-dashboard-metrics";
import { BOT_KIND_LABEL, clickThroughPer100, type BotKind } from "@/lib/traffic-census";

const id = (v: number) => v.toLocaleString("id-ID");

function Delta({ now, before }: { now: number; before: number }) {
  const v = percentChange(now, before);
  if (v === null) return <span>baru</span>;
  return (
    <span className={v < 0 ? "text-destructive" : "text-emerald-600"}>
      {v < 0 ? "▼" : "▲"} {Math.abs(v)}% vs periode lalu
    </span>
  );
}

function Heading({ children, tone }: { children: React.ReactNode; tone?: "ai" | "sales" }) {
  const dot =
    tone === "ai" ? "bg-emerald-600" : tone === "sales" ? "bg-brand-red" : "bg-foreground";
  return (
    <h2 className="mb-1.5 mt-5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span className={`size-1.5 ${dot}`} aria-hidden="true" />
      {children}
    </h2>
  );
}

export function TrafficPanel({
  data,
  range,
}: {
  data: TrafficDashboard | null;
  range: TrafficRange;
}) {
  const label = TRAFFIC_RANGE_LABEL[range];
  if (!data) {
    return (
      <AdminSurface className="p-4 text-sm text-muted-foreground">
        Data lalu lintas belum tersedia. Pastikan migrasi 057 sudah diterapkan.
      </AdminSurface>
    );
  }
  const s = data.sales;
  const funnelMax = Math.max(...s.funnel.map((f) => f.value), 1);
  const bot = (k: string) => BOT_KIND_LABEL[k as BotKind] ?? k;
  const ctr = clickThroughPer100(data.kinds.aiClicks, data.kinds.aiAnswers);
  return (
    <section id="lalu-lintas" className="mt-6 space-y-2.5" aria-label="Lalu lintas dan penjualan">
      <h2 className="text-sm font-semibold">Lalu lintas dan penjualan</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav
          className="inline-flex overflow-hidden rounded-lg border border-border"
          aria-label="Rentang waktu"
        >
          {TRAFFIC_RANGES.map((r: TrafficRange) => (
            <Link
              key={r}
              to="/admin/traffic"
              search={{ range: r }}
              aria-current={r === range ? "page" : undefined}
              className={`px-3 py-1.5 font-mono text-[10px] font-semibold uppercase ${r === range ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              {TRAFFIC_RANGE_LABEL[r]}
            </Link>
          ))}
        </nav>
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-600" aria-hidden="true" />
          <b className="text-foreground">{data.live.online} online</b> · diperbarui{" "}
          {formatAdminDateTime(data.updatedAt)}
        </p>
      </div>

      <AdminSurface className="grid grid-cols-[110px_1fr] gap-3 p-3">
        <div>
          <p className="text-4xl font-bold leading-none tabular-nums">{data.live.online}</p>
          <p className="mt-2 font-mono text-[9px] uppercase text-muted-foreground">
            Orang membaca sekarang
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase text-muted-foreground">Yang sedang dibuka</p>
          <TrafficRows rows={data.live.paths} empty="Belum ada pembaca dalam 5 menit terakhir." />
        </div>
      </AdminSurface>

      <Heading tone="sales">Penjualan · {label}</Heading>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <Kpi
          label="Pendapatan terbayar"
          value={formatRupiah(s.revenue)}
          sub={<Delta now={s.revenue} before={s.previousRevenue} />}
        />
        <Kpi
          label="Pesanan dibayar"
          value={id(s.orders)}
          sub={<Delta now={s.orders} before={s.previousOrders} />}
        />
        <Kpi label="Rata-rata per pesanan" value={formatRupiah(s.aov)} sub="eSIM + Titip Belanja" />
        <Kpi
          label="Konversi pengunjung → bayar"
          value={s.conversionPct === null ? "—" : `${s.conversionPct}%`}
          sub={`${id(s.visitors)} pengunjung`}
        />
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        <AdminSurface className="p-3">
          <CardTitle title="Pendapatan" detail={label} />
          <TrafficLine
            points={data.series.revenue}
            color="var(--brand-red, #d92b2b)"
            format={rupiahShort}
          />
        </AdminSurface>
        <AdminSurface className="p-3">
          <CardTitle title="Corong: dari pembaca sampai bayar" />
          <div className="mt-2 space-y-2">
            {s.funnel.map((f, i) => (
              <div key={f.label} className="text-[11px]">
                <div className="flex justify-between">
                  <span>{f.label}</span>
                  <b className="tabular-nums">
                    {id(f.value)}
                    {i > 0 && s.funnel[0]!.value > 0
                      ? ` · ${Math.round((f.value / s.funnel[0]!.value) * 100)}%`
                      : ""}
                  </b>
                </div>
                <div className="mt-0.5 h-2 rounded-sm bg-muted">
                  <div
                    className="h-2 rounded-sm bg-brand-red"
                    style={{ width: `${Math.max(2, (f.value / funnelMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AdminSurface>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        <AdminSurface className="p-3">
          <CardTitle title="Penjualan per produk" />
          <TrafficRows rows={s.byProduct} money empty="Belum ada penjualan." />
        </AdminSurface>
        <AdminSurface className="p-3">
          <CardTitle
            title="Pendapatan menurut asal pengunjung"
            detail="Dari sesi yang sama saat checkout"
          />
          <TrafficRows rows={s.bySource} money empty="Belum ada penjualan." />
        </AdminSurface>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        <AdminSurface className="p-3">
          <CardTitle title="Halaman yang paling menghasilkan pesanan" />
          <TrafficRows rows={s.byPage} money empty="Belum ada penjualan." />
        </AdminSurface>
        <AdminSurface className="p-3">
          <CardTitle title="Perlu tindakan" />
          <ul className="mt-1 divide-y divide-border text-[11px]">
            {s.actions.map((a) => (
              <li key={a.label}>
                <Link to={a.href as never} className="flex justify-between py-1.5">
                  <span>{a.label}</span>
                  <b
                    className={`tabular-nums ${a.value > 0 ? "text-brand-red" : "text-muted-foreground"}`}
                  >
                    {a.value}
                  </b>
                </Link>
              </li>
            ))}
          </ul>
        </AdminSurface>
      </div>
      <AdminSurface className="overflow-x-auto p-3">
        <CardTitle title="Pesanan terbaru" />
        {s.recent.length === 0 ? (
          <p className="py-2 text-[11px] text-muted-foreground">Belum ada pesanan dibayar.</p>
        ) : (
          <table className="mt-1 w-full text-[11px]">
            <thead>
              <tr className="text-left font-mono text-[9px] uppercase text-muted-foreground">
                <th className="py-1 pr-2">Waktu</th>
                <th className="pr-2">Produk</th>
                <th className="pr-2">Asal</th>
                <th className="pr-2">Status</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {s.recent.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{formatAdminDateTime(r.at)}</td>
                  <td className="pr-2">{r.label}</td>
                  <td className="pr-2">{r.source}</td>
                  <td className="pr-2">{r.status}</td>
                  <td className="text-right tabular-nums">{formatRupiah(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminSurface>

      <Heading>Lalu lintas</Heading>
      {(
        [
          ["24 jam terakhir", data.total24h],
          ["Sejak data pertama", data.totalAll],
        ] as const
      ).map(([title, t]) => (
        <AdminSurface key={title} className="p-3">
          <p className="text-xl font-bold tabular-nums">
            {id(t.people + t.aiAnswers + t.aiCrawl + t.searchEngine)}{" "}
            <span className="font-mono text-[9px] font-normal uppercase text-muted-foreground">
              halaman dibaca · {title}
            </span>
          </p>
          <TrafficSplit
            parts={[
              { label: "Orang", value: t.people, color: "#3b6a99" },
              { label: "Jawaban AI", value: t.aiAnswers, color: "#2f9e6a" },
              { label: "Pencarian & pelatihan AI", value: t.aiCrawl, color: "#8fcfae" },
              { label: "Mesin pencari", value: t.searchEngine, color: "#b9bcc4" },
            ]}
          />
        </AdminSurface>
      ))}

      <div className="grid gap-2.5 md:grid-cols-2">
        <div>
          <Heading>Orang</Heading>
          <AdminSurface className="grid grid-cols-3 p-3 text-center">
            {[
              ["Tampilan · 24 jam", data.people.views24h],
              ["Pengunjung · 24 jam", data.people.visitors24h],
              ["Tampilan · semua", data.people.viewsAll],
            ].map(([l, v]) => (
              <div key={String(l)}>
                <p className="text-xl font-bold tabular-nums">{id(Number(v))}</p>
                <p className="font-mono text-[9px] uppercase text-muted-foreground">{l}</p>
              </div>
            ))}
          </AdminSurface>
        </div>
        <div>
          <Heading tone="ai">AI</Heading>
          <AdminSurface className="grid grid-cols-3 p-3 text-center">
            {[
              ["Jawaban AI · 24 jam", data.ai.answers24h],
              ["Perayapan AI · 24 jam", data.ai.crawls24h],
              ["Jawaban AI · semua", data.ai.answersAll],
            ].map(([l, v]) => (
              <div key={String(l)}>
                <p className="text-xl font-bold tabular-nums">{id(Number(v))}</p>
                <p className="font-mono text-[9px] uppercase text-muted-foreground">{l}</p>
              </div>
            ))}
          </AdminSurface>
        </div>
      </div>

      <AdminSurface className="p-3">
        <CardTitle title="Orang · tampilan halaman" detail={label} />
        <TrafficLine points={data.series.people} color="#3b6a99" />
      </AdminSurface>
      <AdminSurface className="p-3">
        <CardTitle title="Jawaban AI" detail={label} />
        <TrafficLine points={data.series.aiAnswers} color="#2f9e6a" />
      </AdminSurface>

      <Heading>Orang · {label}</Heading>
      <div className="grid gap-2.5 md:grid-cols-2">
        <AdminSurface className="p-3">
          <CardTitle title="Halaman paling banyak dibaca" />
          <TrafficRows rows={data.pages} empty="Belum ada data." />
        </AdminSurface>
        <AdminSurface className="p-3">
          <CardTitle title="Asal kedatangan" />
          <TrafficRows rows={data.referrers} empty="Belum ada data." />
        </AdminSurface>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        <AdminSurface className="p-3">
          <CardTitle title="Kanal" />
          <TrafficRows
            rows={data.channels}
            empty="Belum ada data."
            percent={channelPercent(data.channels)}
          />
        </AdminSurface>
        <AdminSurface className="p-3">
          <CardTitle title="Perangkat" />
          <TrafficRows rows={data.devices} empty="Belum ada data." />
        </AdminSurface>
      </div>

      <Heading tone="ai">AI · {label}</Heading>
      <div className="grid gap-2.5 md:grid-cols-2">
        <AdminSurface className="p-3">
          <CardTitle title="Asisten yang menjawab seseorang dengan halaman ini" />
          <TrafficRows rows={data.assistants} empty="Belum ada jawaban AI." />
        </AdminSurface>
        <AdminSurface className="p-3">
          <CardTitle title="Halaman yang paling sering dibuka asisten AI" />
          <TrafficRows rows={data.aiPages} empty="Belum ada data." />
        </AdminSurface>
      </div>
      <AdminSurface className="p-3">
        <CardTitle title="Orang yang klik dari jawaban AI" detail={label} />
        <TrafficLine points={data.series.aiClicks} color="#2f9e6a" height={90} />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {ctr === null
            ? "Belum ada jawaban AI untuk dibandingkan."
            : `${id(data.kinds.aiClicks)} orang tiba dari asisten AI, sekitar ${ctr} per 100 jawaban. Asisten biasanya menjawab tanpa pembaca membuka sumbernya.`}
        </p>
      </AdminSurface>
      <div className="grid gap-2.5 md:grid-cols-2">
        <AdminSurface className="p-3">
          <CardTitle title="Perayap: pencarian AI, pelatihan, dan mesin pencari" />
          <TrafficRows
            rows={data.crawlers.map((c) => (c.tag ? { ...c, tag: bot(c.tag) } : c))}
            empty="Belum ada perayap tercatat."
          />
        </AdminSurface>
        <AdminSurface className="p-3">
          <CardTitle title="Menurut jenis" />
          <dl className="mt-1.5 space-y-1.5 text-[11px]">
            {[
              [data.kinds.aiAnswers, "Jawaban AI"],
              [data.kinds.aiClicks, "Orang yang tiba dari jawaban AI"],
              [data.kinds.aiCrawl, "Perayapan pencarian AI"],
              [data.kinds.aiTrain, "Perayapan pelatihan AI"],
              [data.kinds.searchEngine, "Perayapan mesin pencari"],
            ].map(([v, l]) => (
              <div key={String(l)} className="flex items-baseline gap-3">
                <dt className="w-14 text-lg font-bold tabular-nums">{id(Number(v))}</dt>
                <dd className="text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </AdminSurface>
      </div>

      <AdminSurface className="p-3 text-[11px] text-muted-foreground">
        <b className="text-foreground">Tidak dihitung · {label}:</b> {id(data.notCounted)}{" "}
        permintaan otomatis yang tidak menyebut identitas dikenal (misalnya curl, scraper, atau
        tanpa identitas).
      </AdminSurface>
      <AdminSurface className="space-y-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <p>
          <b className="text-foreground">Cara angka ini dihitung.</b> Orang adalah tampilan halaman
          dari browser yang menjalankan skrip situs; pengunjung adalah satu sesi browser, tanpa
          alamat IP. Jawaban AI adalah halaman yang dibuka fetcher milik asisten (ChatGPT-User,
          Claude-User, Perplexity-User, dan lainnya) saat menjawab seseorang. Perayap pencarian dan
          pelatihan AI serta mesin pencari dihitung terpisah. Nama perayap berasal dari identitas
          yang mereka sebut dan belum dibuktikan lewat alamat jaringannya.
        </p>
        <p>
          <b className="text-foreground">Penjualan.</b> Pendapatan hanya dari pesanan yang sudah
          dibayar (eSIM, preorder, Titip Belanja), sumber sama dengan Keuangan. Asal pesanan diambil
          dari sesi browser yang sama saat pesanan dibuat; pesanan tanpa tautan sesi tampil "Tidak
          terlacak". Klik tiket ke mitra bukan pendapatan. Semua waktu WIB.
        </p>
      </AdminSurface>
    </section>
  );
}
