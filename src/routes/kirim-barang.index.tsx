import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { BackBar, Page } from "@/components/shell";
import {
  DropPointCard,
  ShippingStatusBadge,
  ShippingTruck,
  shippingPrimaryBtn,
} from "@/components/shipping/shipping-ui";
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
  const tariff = config.countries.JP;
  const countryName = "Jepang";
  const etaMin = config.eta.toBandungDays + config.eta.toJakartaDays + config.eta.toJapanMinDays;
  const etaMax = config.eta.toBandungDays + config.eta.toJakartaDays + config.eta.toJapanMaxDays;
  const open = available && config.enabled;
  const active = (mine ?? []).filter((o) => !shippingIsDead(o.status));
  return (
    <Page tabs={false}>
      <BackBar title="Kirim Barang" fallbackTo="/" />
      <section className="relative mt-1 overflow-hidden rounded-3xl bg-gradient-to-br from-[#EEF2FF] via-white to-[#FFF1F0] p-4 ring-1 ring-border/60">
        <div className="relative z-10 max-w-[62%]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-red">
            Kirim Barang
          </p>
          <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-tight">
            Kirim paket ke {countryName}, kami urus
          </h1>
          <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
            Antar ke drop point, kami timbang dan kirim express. Kamu tinggal melacak.
          </p>
        </div>
        <ShippingTruck className="absolute -right-2 top-3 size-[132px]" />
        <dl className="relative z-10 mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Tarif", `${formatIdr(tariff.rateIdrPerKg)}/kg`],
            ["Estimasi", `${etaMin}–${etaMax} hari`],
            ["Minimum", formatKg(config.minKg)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white/80 px-1 py-2 ring-1 ring-border/50">
              <dt className="text-[10px] text-muted-foreground">{label}</dt>
              <dd className="text-[12px] font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="ios-section-label mt-4">Negara tujuan</p>
      <div
        role="radiogroup"
        aria-label="Negara tujuan"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              className={`tap flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left ring-1 ${live ? "bg-foreground text-background ring-foreground" : "bg-card text-muted-foreground ring-border/70 opacity-80"}`}
            >
              <span className="text-[20px] leading-none" aria-hidden="true">
                {c.flag}
              </span>
              <span>
                <span className="block text-[12.5px] font-semibold leading-tight">{c.name}</span>
                <span className="block text-[10px] leading-tight">
                  {live ? "Tersedia" : "Segera"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="ios-section-label mt-4">Tarif</p>
      <dl className="ios-group divide-y divide-border/70 text-[13px]">
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

      <p className="ios-section-label mt-4">Cara kerja</p>
      <ol className="ios-group divide-y divide-border/70 text-[13px]">
        {[
          "Isi data penerima dan barang",
          "Antar paket ke drop point",
          "Barang ditimbang, kamu bayar",
          "Kami kirim, kamu lacak",
        ].map((text, i) => (
          <li key={text} className="ios-row">
            <span className="ios-tile bg-secondary text-[12px] font-bold">{i + 1}</span>
            <span className="font-semibold">{text}</span>
          </li>
        ))}
      </ol>

      <p className="ios-section-label mt-4">Drop point</p>
      <DropPointCard point={config.dropPoint} />

      <p className="ios-section-label mt-4">Tidak bisa dikirim</p>
      <ul className="ios-group divide-y divide-border/70 text-[12px] text-muted-foreground">
        {config.prohibited.map((line) => (
          <li key={line} className="px-3 py-2">
            {line}
          </li>
        ))}
      </ul>

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
