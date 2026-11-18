import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { TrafficLine, TrafficRows, rupiahShort } from "@/components/admin-traffic-parts";
import { formatRupiah } from "@/lib/admin-dashboard-metrics";
import {
  HEALTH_LABEL,
  RFM_LABEL,
  biggestLeak,
  deltaPct,
  funnelView,
  pctOf,
  retentionPct,
  toCsv,
  type DestinationInsight,
  type FunnelInsight,
  type FeaturesInsight,
  type FunnelStep,
  type InsightAlert,
  type OperationsInsight,
  type InsightResult,
  type RevenueInsight,
  type UsersInsight,
} from "@/lib/analytics-insights";

const num = (v: number) => v.toLocaleString("id-ID");
const MONO = "font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground";

function Block({
  title,
  hint,
  children,
  className = "",
  action,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`border border-border bg-card p-3 ${className}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={MONO}>{title}</h3>
          {hint && <p className="mt-0.5 text-[10.5px] text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  delta?: number | null;
}) {
  return (
    <div className="min-w-0 border-r border-b border-border p-3">
      <p className="truncate text-xl font-bold leading-none tabular-nums">{value}</p>
      <p className={`${MONO} mt-2`}>{label}</p>
      {delta !== undefined && (
        <p
          className={`mt-1 text-[10px] ${delta === null ? "text-muted-foreground" : delta < 0 ? "text-destructive" : "text-emerald-600"}`}
        >
          {delta === null ? "baru" : `${delta < 0 ? "▼" : "▲"} ${Math.abs(delta)}% vs sebelumnya`}
        </p>
      )}
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 border-l border-t border-border bg-card md:grid-cols-4">
      {children}
    </div>
  );
}

function Unavailable({ message }: { message: string | null }) {
  return (
    <div className="border border-border bg-card p-4 text-sm text-muted-foreground">
      {message ?? "Data belum tersedia."}
    </div>
  );
}

function download(name: string, rows: (string | number | null)[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportButton({ name, rows }: { name: string; rows: () => (string | number | null)[][] }) {
  return (
    <button
      type="button"
      onClick={() => download(name, rows())}
      className="inline-flex min-h-8 items-center gap-1 border border-border px-2 text-[11px] font-medium hover:bg-secondary"
    >
      <Download className="size-3" aria-hidden="true" /> CSV
    </button>
  );
}

function FunnelBars({ steps, previous }: { steps: FunnelStep[]; previous?: FunnelStep[] }) {
  const view = funnelView(steps);
  const max = Math.max(...view.map((s) => s.value), 1);
  const prevByKey = new Map((previous ?? []).map((s) => [s.key, s.value]));
  return (
    <ol className="space-y-2">
      {view.map((s, i) => {
        const prev = prevByKey.get(s.key);
        const delta = prev === undefined ? undefined : deltaPct(s.value, prev);
        return (
          <li key={s.key}>
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate">{s.label}</span>
              <span className="shrink-0 tabular-nums">
                <b>{num(s.value)}</b>
                {i > 0 && s.ofPrev !== null && (
                  <span className="ml-1 text-[10.5px] text-muted-foreground">
                    {s.ofPrev}% dari langkah sebelumnya
                  </span>
                )}
                {delta !== undefined && delta !== null && (
                  <span
                    className={`ml-1 text-[10px] ${delta < 0 ? "text-destructive" : "text-emerald-600"}`}
                  >
                    {delta < 0 ? "▼" : "▲"}
                    {Math.abs(delta)}%
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 bg-secondary">
              <div
                className="h-2 bg-brand-red transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ Pengguna

function heat(pct: number | null) {
  if (pct === null) return "bg-transparent text-muted-foreground/40";
  if (pct >= 40) return "bg-brand-red text-white";
  if (pct >= 20) return "bg-brand-red/60 text-white";
  if (pct >= 8) return "bg-brand-red/30";
  if (pct > 0) return "bg-brand-red/15";
  return "bg-secondary/60 text-muted-foreground";
}

export function UsersPanel({ result }: { result: InsightResult<UsersInsight> | undefined }) {
  if (!result?.data) return <Unavailable message={result?.error ?? null} />;
  const d = result.data;
  const t = d.totals;
  const weeks = d.cohorts[0]?.retained.length ?? 0;
  const maxSeg = Math.max(...d.segments.map((s) => s.count), 1);
  return (
    <div className="space-y-3">
      <KpiGrid>
        <Kpi label="Member" value={num(t.members)} hint={`${num(t.guests)} tamu tanpa akun`} />
        <Kpi
          label="Member baru"
          value={num(t.newMembers)}
          delta={deltaPct(t.newMembers, t.previousNewMembers)}
        />
        <Kpi
          label="Pembeli"
          value={num(t.buyers)}
          hint={t.repeatRatePct === null ? undefined : `${t.repeatRatePct}% beli ulang`}
        />
        <Kpi
          label="Rata-rata LTV"
          value={t.avgLtvIdr === null ? "–" : rupiahShort(t.avgLtvIdr)}
          hint={
            t.avgOrdersPerBuyer === null
              ? undefined
              : `${t.avgOrdersPerBuyer} pesanan / pembeli` +
                (t.medianDaysBetweenOrders === null
                  ? ""
                  : ` · jeda ${t.medianDaysBetweenOrders} hari`)
          }
        />
      </KpiGrid>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Pendaftaran harian" hint="Akun member baru per hari">
          <TrafficLine points={d.signups} color="#e11d48" height={120} />
        </Block>
        <Block
          title="Segmen pelanggan (RFM)"
          hint="Satu pelanggan masuk tepat satu segmen"
          action={
            <ExportButton
              name="segmen-pelanggan.csv"
              rows={() => [
                ["Segmen", "Jumlah", "Pendapatan (IDR)"],
                ...d.segments.map((s) => [s.label, s.count, Math.round(s.revenue)]),
              ]}
            />
          }
        >
          <ul className="space-y-2">
            {d.segments.map((s) => (
              <li key={s.segment} title={s.hint}>
                <div className="flex justify-between gap-2 text-[12px]">
                  <span>
                    {s.label} <span className="text-[10px] text-muted-foreground">· {s.hint}</span>
                  </span>
                  <b className="tabular-nums">{num(s.count)}</b>
                </div>
                <div className="mt-1 h-1.5 bg-secondary">
                  <div
                    className="h-1.5 bg-foreground/70"
                    style={{ width: `${Math.max(1, (s.count / maxSeg) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Block>
      </div>

      <Block
        title="Cohort retensi mingguan"
        hint="Pembeli dikelompokkan menurut minggu pembelian pertama; sel = persen yang membeli lagi di minggu ke-N"
      >
        {d.cohorts.length === 0 ? (
          <p className="py-2 text-[11px] text-muted-foreground">
            Belum ada pembeli di 12 minggu terakhir.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-center text-[10.5px] tabular-nums">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-1 text-left font-medium">Minggu</th>
                  <th className="px-1 font-medium">Pembeli</th>
                  {Array.from({ length: weeks }, (_, i) => (
                    <th key={i} className="px-1 font-medium">
                      M{i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td className="whitespace-nowrap px-1 text-left">{c.cohort.slice(5)}</td>
                    <td className="px-1">{c.size}</td>
                    {c.retained.map((v, i) => {
                      const p = retentionPct(c.size, v);
                      return (
                        <td
                          key={i}
                          className={`px-1 py-1 ${heat(p)}`}
                          title={p === null ? "" : `${v} orang`}
                        >
                          {p === null ? "" : `${Math.round(p)}%`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Aktivasi member baru" hint="Dari member yang mendaftar pada rentang ini">
          <FunnelBars steps={d.activation} />
        </Block>
        <Block title="Sumber kunjungan" hint="Sesi unik; grup di bawah 3 disembunyikan">
          <TrafficRows rows={d.sources} empty="Belum ada data." />
        </Block>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Block title="Perangkat">
          <TrafficRows rows={d.devices} empty="Belum ada data." />
        </Block>
        <Block title="Jam aktif (WIB)">
          <TrafficLine points={d.hours} color="#0ea5e9" height={100} />
        </Block>
        <Block title="Hari aktif">
          <TrafficRows rows={d.weekdays} empty="Belum ada data." />
        </Block>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block
          title="Pelanggan terbaik"
          hint="Menurut total pembelian"
          action={
            <ExportButton
              name="pelanggan-terbaik.csv"
              rows={() => [
                [
                  "Nama",
                  "Pesanan",
                  "Pendapatan (IDR)",
                  "Segmen",
                  "Skor kesehatan",
                  "Terakhir beli",
                ],
                ...d.topCustomers.map((c) => [
                  c.name,
                  c.orders,
                  Math.round(c.revenue),
                  RFM_LABEL[c.segment],
                  c.health.score,
                  c.lastOrderAt,
                ]),
              ]}
            />
          }
        >
          <CustomerList
            rows={d.topCustomers.map((c) => ({
              key: c.subject,
              id: c.customerId,
              name: c.name,
              meta: `${c.orders} pesanan · ${RFM_LABEL[c.segment]}`,
              value: formatRupiah(c.revenue),
              badge: `${HEALTH_LABEL[c.health.band]} ${c.health.score}`,
              tone: c.health.band,
            }))}
          />
        </Block>
        <Block
          title="Perlu dihubungi kembali"
          hint="Pelanggan berulang yang mulai sepi: kandidat promo atau pengingat"
          action={
            <ExportButton
              name="pelanggan-berisiko.csv"
              rows={() => [
                ["Nama", "Pesanan", "Pendapatan (IDR)", "Hari sejak beli terakhir"],
                ...d.atRisk.map((c) => [c.name, c.orders, Math.round(c.revenue), c.daysSinceLast]),
              ]}
            />
          }
        >
          <CustomerList
            rows={d.atRisk.map((c) => ({
              key: c.subject,
              id: c.customerId,
              name: c.name,
              meta: `${c.orders} pesanan · ${c.daysSinceLast} hari lalu`,
              value: formatRupiah(c.revenue),
              badge: null,
              tone: "perlu_perhatian" as const,
            }))}
          />
        </Block>
      </div>
    </div>
  );
}

function CustomerList({
  rows,
}: {
  rows: {
    key: string;
    id: string | null;
    name: string;
    meta: string;
    value: string;
    badge: string | null;
    tone: "sehat" | "perlu_perhatian" | "berisiko";
  }[];
}) {
  if (rows.length === 0)
    return <p className="py-2 text-[11px] text-muted-foreground">Belum ada data.</p>;
  const toneClass = {
    sehat: "text-emerald-700 bg-emerald-50",
    perlu_perhatian: "text-amber-700 bg-amber-50",
    berisiko: "text-destructive bg-red-50",
  } as const;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => {
        const body = (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium">{r.name}</p>
              <p className="truncate text-[10.5px] text-muted-foreground">{r.meta}</p>
            </div>
            {r.badge && (
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${toneClass[r.tone]}`}
              >
                {r.badge}
              </span>
            )}
            <span className="shrink-0 text-[12px] font-semibold tabular-nums">{r.value}</span>
          </>
        );
        return (
          <li key={r.key}>
            {r.id ? (
              <Link
                to="/admin/customer/$id"
                params={{ id: r.id }}
                className="flex items-center gap-2 py-2 hover:bg-secondary/60"
              >
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-2 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ Funnel

export function FunnelPanel({ result }: { result: InsightResult<FunnelInsight> | undefined }) {
  if (!result?.data) return <Unavailable message={result?.error ?? null} />;
  const d = result.data;
  const view = funnelView(d.steps);
  const leak = biggestLeak(view);
  const paid = view[view.length - 1];
  const p = d.payment;
  const dailyPts = (key: "visitors" | "checkout" | "paid") =>
    d.daily.map((r) => ({ label: r.label, value: r[key] }));
  return (
    <div className="space-y-3">
      <KpiGrid>
        <Kpi
          label="Pengunjung"
          value={num(view[0]?.value ?? 0)}
          delta={deltaPct(view[0]?.value ?? 0, d.previous[0]?.value ?? 0)}
        />
        <Kpi
          label="Konversi total"
          value={paid?.ofTop === null || paid === undefined ? "–" : `${paid.ofTop}%`}
          hint="Pengunjung → bayar (terlacak)"
        />
        <Kpi
          label="Pesanan belum dibayar"
          value={num(d.abandoned.count)}
          hint={formatRupiah(d.abandoned.valueIdr)}
        />
        <Kpi
          label="Rata-rata waktu bayar"
          value={p.avgMinutesToPay === null ? "–" : `${p.avgMinutesToPay} mnt`}
          hint={`${p.expired} kedaluwarsa · ${p.failed} gagal`}
        />
      </KpiGrid>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block
          title="Funnel penjualan"
          hint={
            leak
              ? `Kebocoran terbesar: "${leak.label}" (hanya ${leak.ofPrev}% lanjut dari langkah sebelumnya)`
              : "Sesi unik per langkah; panah = perubahan vs periode sebelumnya"
          }
        >
          <FunnelBars steps={d.steps} previous={d.previous} />
        </Block>
        <Block title="Tren harian" hint="Pengunjung, mulai checkout, dan bayar">
          <div className="space-y-1">
            <TrafficLine points={dailyPts("visitors")} color="#0ea5e9" height={70} />
            <TrafficLine points={dailyPts("checkout")} color="#f59e0b" height={70} />
            <TrafficLine points={dailyPts("paid")} color="#10b981" height={70} />
          </div>
        </Block>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <FunnelBreakdown title="Per perangkat" groups={d.byDevice} />
        <FunnelBreakdown title="Per kanal / sumber" groups={d.byChannel} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Status pembayaran" hint="Pesanan dan percobaan bayar pada rentang ini">
          <TrafficRows
            rows={[
              { label: "Berhasil", value: p.paid },
              { label: "Menunggu", value: p.pending },
              { label: "Kedaluwarsa", value: p.expired },
              { label: "Gagal", value: p.failed },
            ]}
            empty="Belum ada data."
          />
        </Block>
        <Block title="Per metode / provider" hint="Tingkat sukses bayar">
          {p.byProvider.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">Belum ada data.</p>
          ) : (
            <ul className="space-y-1.5 text-[12px]">
              {p.byProvider.map((r) => (
                <li key={r.label} className="flex justify-between gap-2">
                  <span className="truncate">{r.label}</span>
                  <span className="tabular-nums">
                    <b>{pctOf(r.paid, r.total) ?? 0}%</b>{" "}
                    <span className="text-[10.5px] text-muted-foreground">
                      {r.paid}/{r.total}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    </div>
  );
}

function FunnelBreakdown({
  title,
  groups,
}: {
  title: string;
  groups: { label: string; steps: FunnelStep[] }[];
}) {
  return (
    <Block title={title} hint="Pengunjung → checkout → bayar (grup di bawah 3 sesi disembunyikan)">
      {groups.length === 0 ? (
        <p className="py-2 text-[11px] text-muted-foreground">Belum ada data.</p>
      ) : (
        <table className="w-full text-[12px] tabular-nums">
          <thead>
            <tr className="text-left text-[10px] text-muted-foreground">
              <th className="font-medium">Grup</th>
              <th className="text-right font-medium">Pengunjung</th>
              <th className="text-right font-medium">Checkout</th>
              <th className="text-right font-medium">Bayar</th>
              <th className="text-right font-medium">Konv.</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const [v, , c, , pd] = g.steps;
              return (
                <tr key={g.label} className="border-t border-border">
                  <td className="max-w-[140px] truncate py-1.5">{g.label}</td>
                  <td className="text-right">{num(v?.value ?? 0)}</td>
                  <td className="text-right">{num(c?.value ?? 0)}</td>
                  <td className="text-right">{num(pd?.value ?? 0)}</td>
                  <td className="text-right font-semibold">
                    {pctOf(pd?.value ?? 0, v?.value ?? 0) ?? 0}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Block>
  );
}

// ------------------------------------------------------------------ Pendapatan

export function RevenuePanel({ result }: { result: InsightResult<RevenueInsight> | undefined }) {
  if (!result?.data) return <Unavailable message={result?.error ?? null} />;
  const d = result.data;
  const buyers = d.newVsReturning.newCustomers + d.newVsReturning.returning;
  return (
    <div className="space-y-3">
      <KpiGrid>
        <Kpi
          label="Pendapatan kotor"
          value={rupiahShort(d.gross)}
          delta={deltaPct(d.gross, d.previousGross)}
        />
        <Kpi
          label="Pesanan dibayar"
          value={num(d.orders)}
          delta={deltaPct(d.orders, d.previousOrders)}
        />
        <Kpi label="Rata-rata pesanan" value={d.aov ? rupiahShort(d.aov) : "–"} />
        <Kpi
          label="Refund"
          value={num(d.refundCount)}
          hint={d.refundRatePct === null ? undefined : `${d.refundRatePct}% dari pesanan`}
        />
      </KpiGrid>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Pendapatan harian" hint="Rentang ini">
          <TrafficLine points={d.series} color="#e11d48" height={130} format={rupiahShort} />
        </Block>
        <Block title="Periode sebelumnya" hint="Panjang rentang sama, untuk dibandingkan">
          <TrafficLine
            points={d.previousSeries}
            color="#94a3b8"
            height={130}
            format={rupiahShort}
          />
        </Block>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Per produk">
          <TrafficRows rows={d.byProduct} empty="Belum ada penjualan." money />
        </Block>
        <Block title="Per sumber" hint="Berdasarkan kunjungan yang memulai pesanan">
          <TrafficRows rows={d.byChannel} empty="Belum ada penjualan." money />
        </Block>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Block title="Hari terbaik">
          <TrafficRows rows={d.byWeekday} empty="Belum ada data." money />
        </Block>
        <Block title="Jam terbaik (WIB)">
          <TrafficLine points={d.byHour} color="#6366f1" height={100} format={rupiahShort} />
        </Block>
        <Block
          title="Member baru vs kembali"
          hint="Menurut pembelian pertama sepanjang waktu (member saja)"
        >
          {buyers === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">Belum ada data.</p>
          ) : (
            <ul className="space-y-2 text-[12px]">
              <li className="flex justify-between">
                <span>Baru · {num(d.newVsReturning.newCustomers)}</span>
                <b>{rupiahShort(d.newVsReturning.newRevenue)}</b>
              </li>
              <li className="flex justify-between">
                <span>Kembali · {num(d.newVsReturning.returning)}</span>
                <b>{rupiahShort(d.newVsReturning.returningRevenue)}</b>
              </li>
            </ul>
          )}
        </Block>
      </div>

      <Block
        title="Preorder eSIM"
        hint="Dibayar saat saldo provider kurang; wajib dipenuhi dalam 3 hari sejak bayar"
        action={
          <Link to="/admin/preorders" className="text-[11px] font-medium underline">
            Buka antrean
          </Link>
        }
      >
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold tabular-nums">{d.preorder.open}</p>
            <p className={MONO}>Antre</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-amber-600">
              {d.preorder.nearDeadline}
            </p>
            <p className={MONO}>&lt; 1 hari</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-destructive">{d.preorder.overdue}</p>
            <p className={MONO}>Lewat tenggat</p>
          </div>
        </div>
      </Block>
      <p className="text-[10.5px] text-muted-foreground">
        Margin per paket tersedia di Laporan Keuangan; biaya provider memakai kurs yang berbeda
        sehingga tidak dicampur di sini.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Destinasi

export function DestinationsPanel({
  result,
}: {
  result: InsightResult<DestinationInsight> | undefined;
}) {
  if (!result?.data) return <Unavailable message={result?.error ?? null} />;
  const d = result.data;
  const share = d.unlimitedShare.unlimited + d.unlimitedShare.limited;
  return (
    <div className="space-y-3">
      <Block
        title="Peringkat destinasi"
        hint="Kunjungan halaman destinasi, pesanan yang dimulai dari sana, dan pendapatannya"
        action={
          <ExportButton
            name="destinasi.csv"
            rows={() => [
              ["Kode", "Tampilan", "Pengunjung", "Pesanan", "Pendapatan (IDR)", "Konversi %"],
              ...d.rows.map((r) => [
                r.code.toUpperCase(),
                r.views,
                r.visitors,
                r.orders,
                Math.round(r.revenue),
                r.conversionPct,
              ]),
            ]}
          />
        }
      >
        {d.rows.length === 0 ? (
          <p className="py-2 text-[11px] text-muted-foreground">Belum ada kunjungan destinasi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-[12px] tabular-nums">
              <thead>
                <tr className="text-left text-[10px] text-muted-foreground">
                  <th className="font-medium">Destinasi</th>
                  <th className="text-right font-medium">Tampil</th>
                  <th className="text-right font-medium">Pengunjung</th>
                  <th className="text-right font-medium">Pesanan</th>
                  <th className="text-right font-medium">Pendapatan</th>
                  <th className="text-right font-medium">Konv.</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.code} className="border-t border-border">
                    <td className="py-1.5 font-medium uppercase">
                      <Link
                        to="/destination/$code"
                        params={{ code: r.code }}
                        className="hover:underline"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="text-right">{num(r.views)}</td>
                    <td className="text-right">{num(r.visitors)}</td>
                    <td className="text-right">{num(r.orders)}</td>
                    <td className="text-right">{r.revenue ? rupiahShort(r.revenue) : "–"}</td>
                    <td className="text-right font-semibold">
                      {r.conversionPct === null ? "–" : `${r.conversionPct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block
          title="Peluang"
          hint="Banyak pengunjung (10+) tetapi belum ada pesanan: periksa harga, stok, atau konten"
        >
          {d.opportunity.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">Tidak ada yang menonjol.</p>
          ) : (
            <TrafficRows
              rows={d.opportunity.map((o) => ({ label: o.code.toUpperCase(), value: o.visitors }))}
              empty=""
            />
          )}
        </Block>
        <Block title="Kata pencarian finder" hint="Yang paling sering dicari (minimal 3 kali)">
          <TrafficRows rows={d.searches} empty="Belum ada pencarian berulang." />
        </Block>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Paket terlaris" hint="Menurut pendapatan">
          {d.packages.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">Belum ada penjualan.</p>
          ) : (
            <TrafficRows
              rows={d.packages.map((p) => ({ label: p.label, value: p.revenue, orders: p.orders }))}
              empty=""
              money
            />
          )}
        </Block>
        <Block title="Unlimited vs terbatas" hint="Jumlah baris pesanan yang dibayar">
          {share === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">Belum ada penjualan.</p>
          ) : (
            <TrafficRows
              rows={[
                { label: "Terbatas", value: d.unlimitedShare.limited },
                { label: "Unlimited", value: d.unlimitedShare.unlimited },
              ]}
              empty=""
            />
          )}
        </Block>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Fitur

export function FeaturesPanel({ result }: { result: InsightResult<FeaturesInsight> | undefined }) {
  if (!result?.data) return <Unavailable message={result?.error ?? null} />;
  const { travo, trips, shopping, feeds, notifications } = result.data;
  return (
    <div className="space-y-3">
      <h2 className={MONO}>Travo (asisten AI)</h2>
      <KpiGrid>
        <Kpi
          label="Percakapan baru"
          value={num(travo.conversations)}
          delta={deltaPct(travo.conversations, travo.previousConversations)}
        />
        <Kpi label="Pengguna aktif" value={num(travo.activeUsers)} />
        <Kpi
          label="Pesan pengguna"
          value={num(travo.userMessages)}
          hint={`${num(travo.assistantMessages)} balasan Travo`}
        />
        <Kpi
          label="Pesan / percakapan"
          value={
            travo.messagesPerConversation === null ? "–" : String(travo.messagesPerConversation)
          }
        />
      </KpiGrid>
      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Pesan pengguna per hari">
          <TrafficLine points={travo.daily} color="#6366f1" height={100} />
        </Block>
        <Block title="Topik percakapan" hint="Cakupan yang dipilih pengguna">
          <TrafficRows rows={travo.byScope} empty="Belum ada percakapan." />
        </Block>
      </div>

      <h2 className={`${MONO} pt-2`}>Trip plan & Agenda</h2>
      <KpiGrid>
        <Kpi
          label="Trip dibuat"
          value={num(trips.created)}
          delta={deltaPct(trips.created, trips.previousCreated)}
        />
        <Kpi label="Pembuat trip" value={num(trips.users)} />
        <Kpi label="Pengeluaran dicatat" value={num(trips.expenses)} />
        <Kpi
          label="Dibagikan · struk"
          value={`${num(trips.shares)} · ${num(trips.receiptScans)}`}
        />
      </KpiGrid>
      <Block title="Trip dibuat per hari">
        <TrafficLine points={trips.daily} color="#0ea5e9" height={100} />
      </Block>

      <h2 className={`${MONO} pt-2`}>Titip Belanja</h2>
      <KpiGrid>
        <Kpi
          label="Permintaan masuk"
          value={num(shopping.requests)}
          delta={deltaPct(shopping.requests, shopping.previousRequests)}
        />
        <Kpi
          label="Balasan pertama (median)"
          value={
            shopping.medianFirstReplyMinutes === null
              ? "–"
              : `${shopping.medianFirstReplyMinutes} mnt`
          }
          hint={
            shopping.answeredWithinDuePct === null
              ? undefined
              : `${shopping.answeredWithinDuePct}% sebelum target`
          }
        />
        <Kpi label="Menunggu balasan" value={num(shopping.waitingNow)} />
        <Kpi label="Lewat target balas" value={num(shopping.overdueNow)} />
      </KpiGrid>
      <div className="grid gap-3 lg:grid-cols-2">
        <Block
          title="Funnel permintaan"
          hint="Permintaan pada rentang ini; baris terakhir = semua pesanan dibayar"
        >
          <FunnelBars steps={shopping.funnel} />
        </Block>
        <Block title="Status permintaan">
          <TrafficRows rows={shopping.byStatus} empty="Belum ada permintaan." />
        </Block>
      </div>

      <h2 className={`${MONO} pt-2`}>Feeds</h2>
      <KpiGrid>
        <Kpi label="Post member" value={num(feeds.posts)} />
        <Kpi label="Komentar" value={num(feeds.comments)} hint={`${num(feeds.likes)} suka`} />
        <Kpi
          label="Laporan terbuka"
          value={num(feeds.reportsOpen)}
          hint={`${feeds.reportsActioned} ditindak`}
        />
        <Kpi
          label="Antrean tertua"
          value={feeds.oldestPendingHours === null ? "–" : `${feeds.oldestPendingHours} jam`}
          hint="Post menunggu tinjauan"
        />
      </KpiGrid>
      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Jenis post">
          <TrafficRows rows={feeds.byKind} empty="Belum ada post." />
        </Block>
        <Block title="Status moderasi">
          <TrafficRows rows={feeds.byStatus} empty="Belum ada post." />
        </Block>
      </div>

      <h2 className={`${MONO} pt-2`}>Notifikasi & PWA</h2>
      <KpiGrid>
        <Kpi label="Notifikasi dikirim" value={num(notifications.created)} />
        <Kpi
          label="Dibaca"
          value={notifications.readRatePct === null ? "–" : `${notifications.readRatePct}%`}
        />
        <Kpi label="Langganan push aktif" value={num(notifications.pushActive)} />
      </KpiGrid>
      <div className="grid gap-3 lg:grid-cols-3">
        <Block title="Per jenis">
          <TrafficRows rows={notifications.byType} empty="Belum ada notifikasi." />
        </Block>
        <Block title="Pengiriman (kanal · status)">
          <TrafficRows rows={notifications.delivery} empty="Belum ada percobaan kirim." />
        </Block>
        <Block title="Peristiwa PWA">
          <TrafficRows rows={notifications.pwa} empty="Belum ada peristiwa." />
        </Block>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Operasional

export function OperationsPanel({
  result,
}: {
  result: InsightResult<OperationsInsight> | undefined;
}) {
  if (!result?.data) return <Unavailable message={result?.error ?? null} />;
  const { support, provisioning: pv, system, team } = result.data;
  return (
    <div className="space-y-3">
      <h2 className={MONO}>Bantuan (SLA)</h2>
      <KpiGrid>
        <Kpi
          label="Tiket baru"
          value={num(support.opened)}
          delta={deltaPct(support.opened, support.previousOpened)}
        />
        <Kpi
          label="Terbuka sekarang"
          value={num(support.openNow)}
          hint={
            support.oldestOpenDays === null ? undefined : `tertua ${support.oldestOpenDays} hari`
          }
        />
        <Kpi
          label="Balasan pertama (median)"
          value={
            support.medianFirstReplyMinutes === null
              ? "–"
              : `${support.medianFirstReplyMinutes} mnt`
          }
        />
        <Kpi
          label="Selesai (median)"
          value={
            support.medianResolutionHours === null ? "–" : `${support.medianResolutionHours} jam`
          }
        />
      </KpiGrid>
      <div className="grid gap-3 lg:grid-cols-3">
        <Block title="Umur tiket terbuka">
          <TrafficRows rows={support.aging} empty="Tidak ada tiket terbuka." />
        </Block>
        <Block title="Kategori">
          <TrafficRows rows={support.byCategory} empty="Belum ada tiket." />
        </Block>
        <Block title="Status">
          <TrafficRows rows={support.byStatus} empty="Belum ada tiket." />
        </Block>
      </div>

      <h2 className={`${MONO} pt-2`}>eSIM & provisioning</h2>
      <KpiGrid>
        <Kpi
          label="Pesanan dibayar"
          value={num(pv.paid)}
          hint={`${num(pv.ready)} siap / terpasang`}
        />
        <Kpi
          label="Gagal provisioning"
          value={num(pv.failed)}
          hint={pv.failureRatePct === null ? undefined : `${pv.failureRatePct}% dari dibayar`}
        />
        <Kpi label="Tertahan > 30 mnt" value={num(pv.stuck)} />
        <Kpi
          label="Waktu ke eSIM (median)"
          value={pv.medianMinutesToReady === null ? "–" : `${pv.medianMinutesToReady} mnt`}
          hint={`${pv.refundsOpen} refund menunggu`}
        />
      </KpiGrid>

      <h2 className={`${MONO} pt-2`}>Kesehatan sistem</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Worker" hint="Denyut terakhir; tanda merah bila lebih dari 15 menit">
          {system.workers.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">Belum ada denyut tercatat.</p>
          ) : (
            <ul className="divide-y divide-border text-[12px]">
              {system.workers.map((w) => (
                <li key={w.name} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">
                    {w.name}
                    {w.lastError && (
                      <span className="block truncate text-[10px] text-destructive">
                        {w.lastError}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 text-[11px] font-semibold ${w.stale ? "text-destructive" : "text-emerald-600"}`}
                  >
                    {w.ageMinutes === null ? "belum pernah" : `${w.ageMinutes} mnt lalu`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block title="Antrean & webhook">
          <TrafficRows rows={system.webhooks} empty="Tidak ada webhook pada rentang ini." />
          <ul className="mt-2 space-y-1 text-[12px]">
            <li className="flex justify-between">
              <span>Webhook gagal permanen</span>
              <b className={system.deadLetters > 0 ? "text-destructive" : ""}>
                {system.deadLetters}
              </b>
            </li>
            <li className="flex justify-between">
              <span>Email antre · gagal</span>
              <b>
                {system.emailQueued} · {system.emailFailed}
              </b>
            </li>
            <li className="flex justify-between">
              <span>Pembayaran tidak pasti</span>
              <b className={system.paymentsUnknown > 0 ? "text-destructive" : ""}>
                {system.paymentsUnknown}
              </b>
            </li>
          </ul>
        </Block>
      </div>

      <Block
        title="Aktivitas tim admin"
        hint="Jumlah tindakan tercatat di audit log pada rentang ini"
      >
        <TrafficRows rows={team} empty="Belum ada aktivitas." />
      </Block>
    </div>
  );
}

// ------------------------------------------------------------------ Peringatan

export function AlertsStrip({ alerts }: { alerts: InsightAlert[] }) {
  if (alerts.length === 0)
    return (
      <p className="mb-3 border border-border bg-card px-3 py-2 text-[11.5px] text-emerald-700">
        Tidak ada peringatan aktif (7 hari terakhir dibanding 7 hari sebelumnya).
      </p>
    );
  const tone = {
    critical: "border-l-destructive",
    warning: "border-l-amber-500",
    info: "border-l-sky-500",
  } as const;
  return (
    <section aria-label="Peringatan" className="mb-3 border border-border bg-card">
      <h2 className={`${MONO} border-b border-border px-3 py-2`}>Peringatan ({alerts.length})</h2>
      <ul className="divide-y divide-border">
        {alerts.map((a) => (
          <li key={a.key} className={`border-l-4 ${tone[a.severity]}`}>
            <a
              href={a.href}
              className="flex items-start justify-between gap-3 px-3 py-2 hover:bg-secondary/60"
            >
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold">{a.title}</span>
                <span className="block text-[10.5px] text-muted-foreground">{a.detail}</span>
              </span>
              <span className="shrink-0 text-[11px] font-medium underline">Buka</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
