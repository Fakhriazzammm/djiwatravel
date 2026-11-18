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
  const open = available && config.enabled;
  const active = (mine ?? []).filter((o) => !shippingIsDead(o.status));
  return (
    <Page tabs={false}>
      <BackBar title="Kirim Barang" fallbackTo="/" />
      <div className="ios-card flex items-center gap-3 p-3">
        <ShippingTruck className="size-10" />
        <div className="min-w-0">
          <h1 className="text-[17px] font-bold leading-tight">Ke Jepang</h1>
          <p className="text-[12px] text-muted-foreground">Express, kami urus pengirimannya</p>
        </div>
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
