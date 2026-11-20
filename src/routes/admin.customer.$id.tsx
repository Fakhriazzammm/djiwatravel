import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { CountUp, GrowBar, Reveal, useReducedMotion } from "@/components/admin-motion";
import { avatarTone } from "@/lib/admin-customers-view";
import {
  customerSegment,
  engagementScore,
  featureUsage,
  healthAlerts,
  lastActivity,
  monthlyActivity,
  spend,
  timeline,
} from "@/lib/admin-customer-insight";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminCustomerDetail } from "@/lib/admin-customers.fn";
import { formatAdminDateTime } from "@/lib/admin-display";

export const Route = createFileRoute("/admin/customer/$id")({
  beforeLoad: () => requireAdmin(),
  validateSearch: (search: Record<string, unknown>): { tab?: DetailTab } =>
    DETAIL_TABS.some((t) => t.id === search["tab"]) ? { tab: search["tab"] as DetailTab } : {},
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: ({ params }) => getAdminCustomerDetail({ data: { id: params.id } }),
  component: AdminCustomerDetail,
});

const DETAIL_TABS = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "linimasa", label: "Linimasa" },
  { id: "pesanan", label: "Pesanan" },
  { id: "perilaku", label: "Perilaku" },
  { id: "data", label: "Data & persetujuan" },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]["id"];

const PURPOSE: Record<string, string> = {
  community: "Komunitas",
  ai: "Asisten Travo (AI)",
  personalization: "Personalisasi",
  promo: "Kabar & promo",
};

const GENDER: Record<string, string> = {
  female: "Perempuan",
  male: "Laki-laki",
  unspecified: "Tidak disebut",
};

function money(total: string, currency: string) {
  const value = Number(total);
  return currency === "IDR"
    ? new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(value)
    : `${total} ${currency}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children ?? "—"}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

const idr = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
const compact = (value: number) =>
  value >= 1_000_000
    ? `Rp${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
    : value >= 1_000
      ? `Rp${Math.round(value / 1_000).toLocaleString("id-ID")} rb`
      : `Rp${value}`;
const MONO = "font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const KIND_DOT: Record<string, string> = {
  esim: "bg-[#1d4ed8]",
  trip: "bg-[#0e7490]",
  shopping: "bg-[#b45309]",
  shipping: "bg-[#7c3aed]",
  feed: "bg-[#be185d]",
  consent: "bg-[#64748b]",
  profile: "bg-[#166534]",
};

function ScoreRing({ score }: { score: number }) {
  const reduced = useReducedMotion();
  const r = 26;
  const c = 2 * Math.PI * r;
  const tone = score >= 70 ? "#166534" : score >= 40 ? "#b45309" : "#b91c1c";
  return (
    <div className="flex flex-col items-center">
      <svg
        width="68"
        height="68"
        viewBox="0 0 68 68"
        role="img"
        aria-label={`Skor aktivasi ${score}`}
      >
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-secondary"
        />
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          transform="rotate(-90 34 34)"
          style={{
            transition: reduced ? "none" : "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
        <text x="34" y="39" textAnchor="middle" className="fill-current text-[17px] font-bold">
          {score}
        </text>
      </svg>
      <span className={MONO}>skor aktivasi</span>
    </div>
  );
}

function Kpi({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="px-3 py-2.5 transition-colors hover:bg-secondary/40">
      <p className={MONO}>{label}</p>
      <p className="text-lg font-semibold tabular-nums leading-tight">{children}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ActivityChart({ data }: { data: { key: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const reduced = useReducedMotion();
  return (
    <div>
      <div
        className="flex h-24 items-end gap-1 border-b border-border"
        role="img"
        aria-label="Aktivitas per bulan"
      >
        {data.map((d, index) => (
          <div
            key={d.key}
            className="group relative flex h-full min-w-0 flex-1 items-end"
            title={`${d.key}: ${d.count} aktivitas`}
          >
            <span
              className="w-full origin-bottom bg-[#1d4ed8] transition-opacity group-hover:opacity-70"
              style={{
                height: `${(d.count / max) * 100}%`,
                minHeight: d.count ? 3 : 0,
                animation: reduced
                  ? "none"
                  : `cd-grow-up 600ms cubic-bezier(0.22,1,0.36,1) ${index * 30}ms both`,
              }}
            />
            {d.count > 0 && (
              <span className="absolute -top-4 left-1/2 hidden -translate-x-1/2 font-mono text-[10px] group-hover:block">
                {d.count}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {data.map((d, index) => (
          <span
            key={d.key}
            className="min-w-0 flex-1 truncate text-center text-[9px] text-muted-foreground"
          >
            {index % 2 === 0 ? d.key.slice(5) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function AdminCustomerDetail() {
  const customer = Route.useLoaderData();
  const tab: DetailTab = Route.useSearch().tab ?? "ringkasan";
  const reduced = useReducedMotion();
  if (!customer)
    return (
      <AdminShell title="Customer" subtitle="Detail pelanggan">
        <AdminSurface className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">Customer tidak ditemukan.</p>
          <Link
            to="/admin/customers"
            search={{
              tab: "daftar",
              q: "",
              kind: "all",
              criteria: "all",
              sort: "active",
              page: 1,
              range: "30h",
              from: undefined,
              to: undefined,
            }}
            className="text-sm font-semibold text-brand-red"
          >
            Kembali ke daftar
          </Link>
        </AdminSurface>
      </AdminShell>
    );
  const digits = (customer.whatsapp ?? "").replace(/\D/g, "");
  const name =
    customer.displayName ??
    (customer.kind === "guest" ? "Tamu (tanpa akun)" : "Belum mengisi nama");
  const money$ = spend(customer);
  const score = engagementScore(customer);
  const segment = customerSegment(customer);
  const alerts = healthAlerts(customer);
  const features = featureUsage(customer);
  const events = timeline(customer);
  const activity = monthlyActivity(customer);
  const last = lastActivity(customer);
  const maxFeature = Math.max(...features.map((f) => f.count), 1);
  const triedCount = features.filter((f) => f.count > 0).length;
  const aov = money$.paidOrders ? Math.round(money$.total / money$.paidOrders) : 0;
  const pill = (t: string): "neutral" | "good" | "warn" | "danger" =>
    t === "good" ? "good" : t === "warn" ? "warn" : "neutral";
  const listLink = (
    <Link
      to="/admin/customers"
      search={{
        tab: "daftar",
        q: "",
        kind: "all",
        criteria: "all",
        sort: "active",
        page: 1,
        range: "30h",
        from: undefined,
        to: undefined,
      }}
      className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> Semua customer
    </Link>
  );

  return (
    <AdminShell
      title={name}
      subtitle="Analisis dan semua data customer ini. Setiap pembukaan halaman tercatat di audit log."
    >
      <div className="space-y-3">
        {listLink}

        <Reveal>
          <AdminSurface className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ${avatarTone(customer.id)}`}
              >
                {(name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold leading-tight">{name}</h2>
                <p className="truncate text-sm text-muted-foreground">
                  {[customer.email, customer.whatsapp].filter(Boolean).join(" · ") ||
                    "Kontak belum tersimpan"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusPill tone={pill(segment.tone)}>{segment.label}</StatusPill>
                  <StatusPill>{customer.kind === "guest" ? "Tamu" : "Member"}</StatusPill>
                  {customer.kind === "member" && !customer.profile && (
                    <StatusPill tone="warn">Profil belum lengkap</StatusPill>
                  )}
                </div>
                {last && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aktivitas terakhir {formatAdminDateTime(last)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {customer.whatsapp && digits && (
                  <a
                    href={`https://wa.me/${digits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-semibold"
                  >
                    <MessageCircle className="size-4 text-brand-red" aria-hidden="true" /> WhatsApp
                  </a>
                )}
                <ScoreRing score={score} />
              </div>
            </div>
          </AdminSurface>
        </Reveal>

        <Reveal className="grid grid-cols-2 divide-border border border-border bg-card sm:grid-cols-4 sm:divide-x [&>div]:border-b [&>div]:border-border sm:[&>div]:border-b-0">
          <Kpi label="Total belanja" hint={`${money$.paidOrders} transaksi dibayar`}>
            {compact(money$.total)}
          </Kpi>
          <Kpi label="Rata-rata transaksi" hint="dari yang dibayar">
            {aov ? compact(aov) : "—"}
          </Kpi>
          <Kpi
            label="Fitur dicoba"
            hint={
              features
                .filter((f) => f.count > 0)
                .map((f) => f.label)
                .join(", ") || "belum ada"
            }
          >
            <CountUp value={triedCount} /> / {features.length}
          </Kpi>
          <Kpi label="Total aktivitas" hint="semua jenis">
            <CountUp value={events.length} />
          </Kpi>
        </Reveal>

        <section aria-label="Kesehatan akun">
          <Reveal>
            <AdminSurface className="p-3">
              <p className={MONO}>Kesehatan akun · otomatis</p>
              {alerts.length === 0 ? (
                <p className="mt-2 inline-block rounded bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
                  Tidak ada masalah terdeteksi
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {alerts.map((a) => (
                    <li
                      key={a.text}
                      className={`rounded px-3 py-1.5 text-sm ${a.tone === "bad" ? "bg-red-50 text-red-800" : a.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-secondary text-muted-foreground"}`}
                    >
                      {a.text}
                    </li>
                  ))}
                </ul>
              )}
            </AdminSurface>
          </Reveal>
        </section>

        <div
          role="tablist"
          aria-label="Bagian detail"
          className="flex overflow-x-auto border border-border bg-card [scrollbar-width:none]"
        >
          {DETAIL_TABS.map((t) => (
            <Link
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              to="/admin/customer/$id"
              params={{ id: customer.id }}
              search={{ tab: t.id }}
              replace
              className={`shrink-0 px-4 py-2.5 text-sm transition-colors ${tab === t.id ? "bg-foreground font-semibold text-background" : "hover:bg-secondary"}`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {tab === "ringkasan" && (
          <div className="grid gap-3 lg:grid-cols-2">
            <Reveal>
              <AdminSurface className="p-4">
                <p className={MONO}>Profil</p>
                <dl className="mt-1 divide-y divide-border">
                  <Field label="Email">
                    {customer.email ? (
                      <a href={`mailto:${customer.email}`} className="text-brand-red">
                        {customer.email}
                      </a>
                    ) : (
                      "Belum tersimpan"
                    )}
                  </Field>
                  <Field label="WhatsApp">{customer.whatsapp ?? "Belum tersimpan"}</Field>
                  <Field label="ID akun">
                    <span className="font-mono text-xs">{customer.id}</span>
                  </Field>
                  {customer.profile && (
                    <>
                      <Field label="Kewarganegaraan">{customer.profile.nationality}</Field>
                      <Field label="Tanggal lahir">{customer.profile.dateOfBirth}</Field>
                      <Field label="Jenis kelamin">
                        {customer.profile.gender
                          ? (GENDER[customer.profile.gender] ?? customer.profile.gender)
                          : null}
                      </Field>
                      <Field label="Profil dibuat">
                        {formatAdminDateTime(customer.profile.createdAt)}
                      </Field>
                      <Field label="Profil diubah">
                        {formatAdminDateTime(customer.profile.updatedAt)}
                      </Field>
                    </>
                  )}
                </dl>
              </AdminSurface>
            </Reveal>
            <div className="space-y-3">
              <Reveal>
                <AdminSurface className="p-4">
                  <p className={MONO}>Rincian belanja</p>
                  <ul className="mt-2 space-y-2">
                    {[
                      ["eSIM", money$.esim],
                      ["Titip Belanja", money$.shop],
                      ["Kirim Barang", money$.ship],
                    ].map(([label, value]) => (
                      <li key={label as string}>
                        <div className="flex justify-between text-sm">
                          <span>{label}</span>
                          <b className="tabular-nums">{idr(value as number)}</b>
                        </div>
                        <div className="mt-1 h-1.5 bg-secondary">
                          <GrowBar
                            percent={money$.total ? ((value as number) / money$.total) * 100 : 0}
                            className="h-1.5 bg-[#1d4ed8]"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </AdminSurface>
              </Reveal>
              <Reveal>
                <AdminSurface className="p-4">
                  <p className={MONO}>Aktivitas 12 bulan</p>
                  <div className="mt-2">
                    <ActivityChart data={activity} />
                  </div>
                </AdminSurface>
              </Reveal>
            </div>
          </div>
        )}

        {tab === "linimasa" && (
          <AdminSurface className="p-4">
            {events.length === 0 ? (
              <Empty>Belum ada aktivitas.</Empty>
            ) : (
              <ol className="relative space-y-3 border-l border-border pl-4">
                {events.slice(0, 80).map((e, index) => (
                  <li
                    key={`${e.at}-${e.title}-${index}`}
                    className="relative"
                    style={{
                      animation: reduced
                        ? "none"
                        : `cd-fade-in 400ms ease ${Math.min(index * 25, 400)}ms both`,
                    }}
                  >
                    <span
                      className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full ring-2 ring-card ${KIND_DOT[e.kind]}`}
                    />
                    <p className="text-sm font-medium">{e.title}</p>
                    {e.detail && (
                      <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">{formatAdminDateTime(e.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </AdminSurface>
        )}

        {tab === "perilaku" && (
          <div className="grid gap-3 lg:grid-cols-2">
            <AdminSurface className="p-4">
              <p className={MONO}>Fitur yang dipakai</p>
              <ul className="mt-2 space-y-2.5">
                {features.map((f) => (
                  <li key={f.id}>
                    <div className="flex justify-between text-sm">
                      <span>{f.label}</span>
                      <b className="tabular-nums">{f.count}</b>
                    </div>
                    <div className="mt-1 h-1.5 bg-secondary">
                      <GrowBar
                        percent={(f.count / maxFeature) * 100}
                        className="h-1.5 bg-[#7c3aed]"
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Belum dicoba:{" "}
                {features
                  .filter((f) => f.count === 0)
                  .map((f) => f.label)
                  .join(", ") || "semua sudah dicoba"}
              </p>
            </AdminSurface>
            <AdminSurface className="p-4">
              <p className={MONO}>Interaksi Feeds</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Postingan", customer.feeds.posts.length],
                  ["Komentar", customer.feeds.comments],
                  ["Suka", customer.feeds.likes],
                ].map(([label, value]) => (
                  <div key={label as string} className="bg-secondary p-2">
                    <p className="text-lg font-semibold tabular-nums">
                      <CountUp value={value as number} />
                    </p>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <p className={`${MONO} mt-4`}>Skor aktivasi</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Fitur dicoba (eSIM 25, perjalanan 15, Titip Belanja 15, Kirim Barang 15, Feeds 10),
                transaksi dibayar 10, profil lengkap 5, WhatsApp 3, persetujuan data 2.
              </p>
            </AdminSurface>
          </div>
        )}

        {tab === "pesanan" && (
          <div className="space-y-3">
            <section aria-label="Pesanan">
              <SectionHeading title={`Pesanan eSIM (${customer.orders.length})`} />
              <AdminSurface className="divide-y divide-border p-3">
                {customer.orders.length === 0 ? (
                  <Empty>Belum ada pesanan.</Empty>
                ) : (
                  customer.orders.map((order) => (
                    <article
                      key={order.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <Link
                          to="/admin/orders"
                          search={{ q: order.code ?? "" } as never}
                          className="font-mono text-xs font-semibold text-brand-red"
                        >
                          {order.code ?? order.id}
                        </Link>
                        <p className="truncate text-muted-foreground">{order.items || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          Dibuat {formatAdminDateTime(order.createdAt)}
                          {order.paidAt ? ` · Dibayar ${formatAdminDateTime(order.paidAt)}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <StatusPill
                          tone={
                            order.status === "READY" || order.status === "INSTALLED"
                              ? "good"
                              : "neutral"
                          }
                        >
                          {order.status}
                        </StatusPill>
                        <p className="mt-1 font-semibold">{money(order.total, order.currency)}</p>
                      </div>
                    </article>
                  ))
                )}
              </AdminSurface>
            </section>

            {customer.kind === "member" && (
              <>
                <section aria-label="Perjalanan">
                  <SectionHeading title={`Perjalanan (${customer.trips.length})`} />
                  <AdminSurface className="divide-y divide-border p-3">
                    {customer.trips.length === 0 ? (
                      <Empty>Belum ada perjalanan.</Empty>
                    ) : (
                      customer.trips.map((trip) => (
                        <article
                          key={`${trip.name}-${trip.createdAt}`}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                        >
                          <div>
                            <p className="font-semibold">{trip.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {trip.destination} · {trip.departure ?? "?"} →{" "}
                              {trip.returnDate ?? "?"}
                            </p>
                          </div>
                          {trip.archived && <StatusPill>Diarsipkan</StatusPill>}
                        </article>
                      ))
                    )}
                  </AdminSurface>
                </section>

                <section aria-label="Titip Belanja">
                  <SectionHeading title={`Titip Belanja (${customer.shopping.length})`} />
                  <AdminSurface className="divide-y divide-border p-3">
                    {customer.shopping.length === 0 ? (
                      <Empty>Belum ada pesanan Titip Belanja.</Empty>
                    ) : (
                      customer.shopping.map((order) => (
                        <article key={order.code} className="py-2.5 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold">{order.code}</span>
                            <StatusPill>{order.status}</StatusPill>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Intl.NumberFormat("id-ID", {
                              style: "currency",
                              currency: "IDR",
                              maximumFractionDigits: 0,
                            }).format(order.totalIdr)}
                            {" · "}
                            {formatAdminDateTime(order.createdAt)}
                          </p>
                          {(order.recipientName || order.recipientWhatsapp || order.city) && (
                            <p className="text-xs text-muted-foreground">
                              Penerima:{" "}
                              {[order.recipientName, order.recipientWhatsapp, order.city]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </article>
                      ))
                    )}
                  </AdminSurface>
                </section>

                <section aria-label="Kirim Barang">
                  <SectionHeading title={`Kirim Barang (${customer.shipping.length})`} />
                  <AdminSurface className="divide-y divide-border p-3">
                    {customer.shipping.length === 0 ? (
                      <Empty>Belum ada pengiriman.</Empty>
                    ) : (
                      customer.shipping.map((order) => (
                        <article key={order.code} className="py-2.5 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold">{order.code}</span>
                            <StatusPill>{order.status}</StatusPill>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {order.country} · est. {order.estimatedKg} kg
                            {order.totalIdr ? ` · ${idr(order.totalIdr)}` : ""}
                            {" · "}
                            {formatAdminDateTime(order.createdAt)}
                          </p>
                        </article>
                      ))
                    )}
                  </AdminSurface>
                </section>
              </>
            )}
          </div>
        )}

        {tab === "data" && customer.kind === "member" && (
          <div className="space-y-3">
            <section aria-label="Feeds">
              <SectionHeading
                title="Feeds"
                detail={`${customer.feeds.posts.length} post · ${customer.feeds.comments} komentar · ${customer.feeds.likes} suka`}
              />
              <AdminSurface className="divide-y divide-border p-3">
                {customer.feeds.posts.length === 0 ? (
                  <Empty>Belum ada postingan.</Empty>
                ) : (
                  customer.feeds.posts.map((post) => (
                    <article key={post.id} className="py-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill>{post.kind}</StatusPill>
                        <StatusPill tone={post.status === "PUBLISHED" ? "good" : "warn"}>
                          {post.status}
                        </StatusPill>
                        <span className="text-xs text-muted-foreground">
                          {formatAdminDateTime(post.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-muted-foreground">{post.excerpt}</p>
                    </article>
                  ))
                )}
              </AdminSurface>
            </section>

            <section aria-label="Persetujuan data">
              <SectionHeading
                title="Persetujuan data"
                detail="Pilihan terakhir pelanggan; analitik adalah pilihan perangkat."
              />
              <AdminSurface className="divide-y divide-border p-3">
                {customer.consents.length === 0 ? (
                  <Empty>Belum menjawab persetujuan data.</Empty>
                ) : (
                  customer.consents.map((consent) => (
                    <div
                      key={consent.purpose}
                      className="flex items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <span>{PURPOSE[consent.purpose] ?? consent.purpose}</span>
                      <span className="flex items-center gap-2">
                        <StatusPill tone={consent.granted ? "good" : "neutral"}>
                          {consent.granted ? "Setuju" : "Tidak"}
                        </StatusPill>
                        <span className="text-xs text-muted-foreground">
                          {formatAdminDateTime(consent.at)}
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </AdminSurface>
            </section>
          </div>
        )}
        {tab === "data" && customer.kind === "guest" && (
          <AdminSurface className="p-4">
            <Empty>Tamu tidak punya profil, Feeds, atau persetujuan data.</Empty>
          </AdminSurface>
        )}
      </div>
    </AdminShell>
  );
}
