import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, Wifi, Luggage, ShoppingBag, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Page, Wordmark } from "@/components/shell";
import { destinations, fromPrice, getDest, getPkg, gbLabel } from "@/lib/catalog";
import { rupiah } from "@/lib/pricing";
import { useOrders } from "@/lib/orders";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Djiwa Travel — Mau pergi ke mana?" },
      { name: "description", content: "eSIM internasional untuk traveler Indonesia. Pilih tujuan, bayar QRIS, langsung online." },
      { property: "og:title", content: "Djiwa Travel — Mau pergi ke mana?" },
      { property: "og:description", content: "eSIM internasional untuk traveler Indonesia. Bayar QRIS, langsung online." },
    ],
  }),
  component: Home,
});

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}

function Splash() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("djiwa.splash")) return;
    sessionStorage.setItem("djiwa.splash", "1");
    setShow(true);
    const t = setTimeout(() => setShow(false), 1100);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="animate-splash fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <Wordmark className="text-4xl" />
      <p className="mt-2 text-sm text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
    </div>
  );
}

function Home() {
  const [hello, setHello] = useState("Halo");
  const nav = useNavigate();
  const orders = useOrders();
  useEffect(() => setHello(greeting()), []);
  const active = orders?.find((o) => o.status === "READY");
  const pkg = active && getPkg(active.packageId);
  const dest = pkg && getDest(pkg.dest);

  return (
    <Page>
      <Splash />
      <div className="flex items-center justify-between pt-2">
        <Wordmark className="text-lg" />
        <Link to="/profile" className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold">T</Link>
      </div>

      <p className="mt-8 text-[15px] text-muted-foreground">{hello},</p>
      <h1 className="large-title mt-1">Mau pergi ke mana?</h1>

      <button onClick={() => nav({ to: "/explore" })}
        className="tap mt-5 flex h-14 w-full items-center gap-3 rounded-2xl bg-surface px-4 text-left text-[17px] text-muted-foreground shadow-sm">
        <Search className="size-5" /> Cari negara atau wilayah
      </button>

      {active && pkg && dest && (
        <section className="mt-8">
          <h2 className="mb-3 text-[20px] font-bold">Perjalananmu</h2>
          <Link to="/my-esim/$id" params={{ id: active.id }} className="tap block rounded-2xl bg-primary p-5 text-primary-foreground">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{dest.flag}</span>
              <div className="flex-1">
                <p className="text-[17px] font-semibold">{dest.name}</p>
                <p className="text-sm opacity-75">{gbLabel(pkg.dataGb)} · {pkg.days} hari</p>
              </div>
              <ChevronRight className="size-5 opacity-60" />
            </div>
            {typeof pkg.dataGb === "number" && (
              <>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary-foreground/20">
                  <div className="h-full rounded-full bg-brand-red" style={{ width: `${100 - ((active.usedGb ?? 0) / pkg.dataGb) * 100}%` }} />
                </div>
                <p className="mt-2 text-sm opacity-80">{(pkg.dataGb - (active.usedGb ?? 0)).toFixed(1)} GB tersisa</p>
              </>
            )}
          </Link>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-[20px] font-bold">Destinasi Populer</h2>
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
          {destinations.filter((d) => d.popular).map((d) => (
            <Link key={d.code} to="/destination/$code" params={{ code: d.code.toLowerCase() }}
              className="tap w-32 shrink-0 rounded-2xl bg-surface p-4">
              <span className="text-4xl">{d.flag}</span>
              <p className="mt-3 font-semibold leading-tight">{d.nameId}</p>
              <p className="mt-1 text-xs text-muted-foreground">Mulai {rupiah(fromPrice(d.code))}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[20px] font-bold">Kebutuhan Perjalananmu</h2>
        <div className="grid grid-cols-3 gap-3">
          <Link to="/explore" className="tap rounded-2xl bg-surface p-4">
            <Wifi className="size-6 text-brand-red" strokeWidth={1.8} />
            <p className="mt-3 text-sm font-semibold">eSIM</p>
          </Link>
          {[{ i: Luggage, l: "Bagasi" }, { i: ShoppingBag, l: "Personal Shopper" }].map(({ i: I, l }) => (
            <div key={l} className="rounded-2xl bg-surface p-4 opacity-60">
              <I className="size-6" strokeWidth={1.8} />
              <p className="mt-3 text-sm font-semibold leading-tight">{l}</p>
              <p className="text-[11px] text-muted-foreground">Segera hadir</p>
            </div>
          ))}
        </div>
      </section>

      <Link to="/finder" className="tap mt-8 flex items-center justify-between rounded-2xl bg-brand-red-soft p-5">
        <div>
          <p className="font-semibold">Cari Paket yang Cocok</p>
          <p className="text-sm text-muted-foreground">Masukkan tanggal & kebutuhanmu</p>
        </div>
        <ChevronRight className="size-5 text-brand-red" />
      </Link>
    </Page>
  );
}
