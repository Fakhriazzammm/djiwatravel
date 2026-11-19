import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { BackBar, Page } from "@/components/shell";
import {
  DropPointCard,
  ShippingStatusBadge,
  shippingPrimaryBtn,
} from "@/components/shipping/shipping-ui";
import { ShippingHeroTruck } from "@/components/shipping/shipping-hero-truck";
import { getShippingStatus, listMyShippingOrders } from "@/lib/shipping.fn";
import {
  DEFAULT_SHIPPING_CONFIG,
  formatIdr,
  formatKg,
  normalizeShippingConfig,
  shippingIsDead,
} from "@/lib/shipping";

const COUNTRY_CHOICES = [
  { code: "JP", name: "Jepang", flag: "🇯🇵" },
  { code: "KR", name: "Korea", flag: "🇰🇷" },
  { code: "SG", name: "Singapura", flag: "🇸🇬" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
] as const;

const INFO_TABS = [
  { id: "cara", label: "Cara kerja" },
  { id: "tarif", label: "Tarif" },
  { id: "drop", label: "Drop point" },
  { id: "larangan", label: "Larangan" },
] as const;
type InfoTab = (typeof INFO_TABS)[number]["id"];

export const Route = createFileRoute("/kirim-barang/")({
  head: () => ({
    meta: [
      { title: "Kirim Barang ke Jepang — Djiwa Travel" },
      {
        name: "description",
        content:
          "Antar paketmu ke drop point Djiwa di Tasikmalaya, kami timbang dan kirim express ke Jepang. Tarif per kilogram.",
      },
    ],
  }),
  loader: async () => {
    const status = await getShippingStatus().catch(() => ({
      config: DEFAULT_SHIPPING_CONFIG,
      available: false,
    }));
    // A signed-out visitor still reads the tariff; the list only loads for a member.
    const mine = await listMyShippingOrders().catch(() => null);
    return { config: normalizeShippingConfig(status.config), available: status.available, mine };
  },
  component: ShippingHome,
});

function ShippingHome() {
  const { config, available, mine } = Route.useLoaderData();
  const [tab, setTab] = useState<InfoTab>("cara");
  const tariff = config.countries.JP;
  const countryName = "Jepang";
  const etaMin = config.eta.toBandungDays + config.eta.toJakartaDays + config.eta.toJapanMinDays;
  const etaMax = config.eta.toBandungDays + config.eta.toJakartaDays + config.eta.toJapanMaxDays;
  const open = available && config.enabled;
  const active = (mine ?? []).filter((o) => !shippingIsDead(o.status));
  return (
    <Page tabs={false}>
      <BackBar title="Kirim Barang" fallbackTo="/" />
      <section className="relative mt-1 min-h-[190px] overflow-hidden rounded-[22px] bg-brand-red-soft px-4 pb-10 pt-4">
        <div className="pointer-events-none relative z-10 w-[56%]">
          <span className="inline-block rounded-full bg-white px-2.5 py-0.5 text-[10.5px] font-bold text-brand-red">
            🇯🇵 Jepang · Express
          </span>
          <h1 className="mt-2 text-[21px] font-bold leading-[1.1] tracking-tight">
            Paketmu sampai {countryName}
          </h1>
          <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
            Antar ke drop point, kami timbang dan kirim express. Kamu tinggal melacak.
          </p>
        </div>
        <ShippingHeroTruck />
      </section>
      <dl className="relative z-10 -mt-6 grid grid-cols-3 gap-2 px-2 text-center">
        {[
          ["Tarif", `${formatIdr(tariff.rateIdrPerKg)}/kg`],
          ["Estimasi", `${etaMin}–${etaMax} hari`],
          ["Minimum", formatKg(config.minKg)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl bg-card px-1 py-2 shadow-md ring-1 ring-border/40"
          >
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className="text-[12.5px] font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div
        role="radiogroup"
        aria-label="Negara tujuan"
        className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {COUNTRY_CHOICES.map((c) => {
          const live = c.code === "JP";
          return (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={live}
              disabled={!live}
              className={`tap flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 ${live ? "bg-foreground text-background ring-foreground" : "bg-card text-muted-foreground opacity-80 ring-border/70"}`}
            >
              <span aria-hidden="true">{c.flag}</span>
              {c.name}
              {!live && <span className="text-[9.5px] font-medium">· Segera</span>}
            </button>
          );
        })}
      </div>

      <div
        role="tablist"
        aria-label="Info Kirim Barang"
        className="mt-3 flex rounded-xl bg-secondary p-[3px]"
      >
        {INFO_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`kb-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="kb-panel"
            onClick={() => setTab(t.id)}
            className={`tap flex-1 rounded-[10px] py-1.5 text-[12px] font-semibold transition-colors ${tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="kb-panel"
        aria-labelledby={`kb-tab-${tab}`}
        className="mt-2 text-[13px]"
      >
        {tab === "cara" && (
          <ol className="ios-group divide-y divide-border/70">
            {[
              "Isi data penerima dan barang",
              "Antar paket ke drop point",
              "Barang ditimbang, kamu bayar",
              "Kami kirim, kamu lacak",
            ].map((text, i) => (
              <li key={text} className="ios-row">
                <span className="ios-tile bg-brand-red-soft text-[12px] font-bold text-brand-red">
                  {i + 1}
                </span>
                <span className="font-semibold">{text}</span>
              </li>
            ))}
          </ol>
        )}
        {tab === "tarif" && (
          <dl className="ios-group divide-y divide-border/70">
            <div className="ios-row justify-between">
              <dt className="text-muted-foreground">Per kg</dt>
              <dd className="font-semibold">{formatIdr(tariff.rateIdrPerKg)}</dd>
            </div>
            <div className="ios-row justify-between">
              <dt className="text-muted-foreground">Dihitung dari</dt>
              <dd className="text-right font-semibold">
                Berat timbang, bulat {formatKg(config.roundKg)}
              </dd>
            </div>
            <div className="ios-row justify-between">
              <dt className="text-muted-foreground">Minimum</dt>
              <dd className="font-semibold">{formatKg(config.minKg)}</dd>
            </div>
          </dl>
        )}
        {tab === "drop" && <DropPointCard point={config.dropPoint} />}
        {tab === "larangan" && (
          <ul className="ios-group divide-y divide-border/70 text-[12px] text-muted-foreground">
            {config.prohibited.map((line) => (
              <li key={line} className="px-3 py-2">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>

      {active.length > 0 && (
        <>
          <p className="ios-section-label mt-4">Pengirimanmu</p>
          <ul className="ios-group divide-y divide-border/70">
            {active.slice(0, 3).map((o) => (
              <li key={o.id}>
                <Link to="/kirim-barang/$id" params={{ id: o.id }} className="tap ios-row">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{o.code}</span>
                    <span className="block text-[11px] text-muted-foreground">{o.contents}</span>
                  </span>
                  <ShippingStatusBadge status={o.status} />
                  <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {mine && mine.length > 0 && (
        <Link
          to="/kirim-barang/pengiriman"
          className="tap mt-2 block text-center text-[12px] font-semibold text-brand-red"
        >
          Lihat semua pengiriman
        </Link>
      )}

      <div className="mt-4">
        {open ? (
          <Link to="/kirim-barang/baru" className={shippingPrimaryBtn}>
            Mulai kirim barang
          </Link>
        ) : (
          <p className="rounded-xl bg-secondary p-3 text-center text-[12px] text-muted-foreground">
            Kirim Barang belum dibuka. Kami kabari lewat notifikasi begitu layanan tersedia.
          </p>
        )}
      </div>
    </Page>
  );
}
