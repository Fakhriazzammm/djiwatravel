import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, Wifi, User, Luggage, ShoppingBag, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Page, Wordmark, SectionTitle } from "@/components/shell";
import { destinations } from "@/lib/catalog";
import { useOrders } from "@/lib/orders";
import { signInGoogle } from "@/lib/better-auth-client";
import jp from "@/assets/dest-jp.jpg";
import sg from "@/assets/dest-sg.jpg";
import th from "@/assets/dest-th.jpg";
import kr from "@/assets/dest-kr.jpg";

const photos: Record<string, string> = { JP: jp, SG: sg, TH: th, KR: kr };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Djiwa Travel — Mau pergi ke mana?" },
      {
        name: "description",
        content:
          "eSIM internasional untuk traveler Indonesia. Pilih tujuan, bayar QRIS, langsung online.",
      },
      { property: "og:title", content: "Djiwa Travel — Mau pergi ke mana?" },
      {
        property: "og:description",
        content: "eSIM internasional untuk traveler Indonesia. Bayar QRIS, langsung online.",
      },
    ],
  }),
  component: Home,
});

function greeting() {
  const h = new Date().getHours();
  return h < 11
    ? "Selamat pagi"
    : h < 15
      ? "Selamat siang"
      : h < 18
        ? "Selamat sore"
        : "Selamat malam";
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
      <Wordmark className="h-28" />
      <p className="mt-2 text-sm text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
    </div>
  );
}

function Home() {
  const [hello, setHello] = useState("Halo");
  const nav = useNavigate();
  const orders = useOrders();
  useEffect(() => setHello(greeting()), []);
  const active = orders?.find((o) => o.status === "READY" || o.status === "INSTALLED");
  const activeName = active?.packageName ?? active?.packageId;
  const activeLocation = active?.locationCodes?.join(", ") || "Regional";
  const activeQuota =
    active?.volumeBytes == null
      ? "Unlimited"
      : `${(active.volumeBytes / 1_000_000_000).toFixed(1)} GB`;
  const activeDuration = active?.durationDays ?? 0;

  const services = [
    { icon: Wifi, label: "eSIM", sub: "Internasional", to: "/catalog" as const },
    { icon: Luggage, label: "Bagasi", sub: "Segera hadir" },
    { icon: ShoppingBag, label: "Shopper", sub: "Segera hadir" },
  ];

  return (
    <Page>
      <Splash />
      <header className="flex h-14 items-center justify-between">
        <Wordmark className="h-11" />
        <Link
          to="/profile"
          aria-label="Profil"
          className="tap flex size-10 shrink-0 items-center justify-center rounded-full bg-surface shadow-sm"
        >
          <User className="size-5" strokeWidth={1.8} />
        </Link>
      </header>

      <p className="mt-4 text-[14px] text-muted-foreground">{hello},</p>
      <div className="flex items-end justify-between gap-3"><h1 className="large-title">Mau pergi ke mana?</h1><button type="button" onClick={() => void signInGoogle(`${window.location.origin}/profile`)} className="tap min-h-11 shrink-0 rounded-xl bg-brand-red px-3 py-2 text-xs font-semibold text-white">Masuk dengan Google</button></div>

      <button
        onClick={() => nav({ to: "/catalog" })}
        className="tap mt-4 flex h-12 w-full items-center gap-3 rounded-2xl bg-surface px-4 text-left text-[15px] text-muted-foreground shadow-sm"
      >
        <Search className="size-5 shrink-0" /> Cari negara atau wilayah
      </button>

      <section className="mt-7">
        <SectionTitle action={<Link to="/catalog">Lihat Semua ›</Link>}>
          Destinasi Populer
        </SectionTitle>
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4">
          {destinations
            .filter((d) => d.popular)
            .map((d) => (
              <Link
                key={d.code}
                to="/catalog"
                className="tap relative aspect-[4/5] w-[31%] min-w-28 shrink-0 snap-start overflow-hidden rounded-2xl bg-secondary"
              >
                {photos[d.code] ? (
                  <img
                    src={photos[d.code]}
                    alt={d.nameId}
                    loading="lazy"
                    width={736}
                    height={912}
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center pb-8 text-5xl">
                    {d.flag}
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/85 to-transparent px-2.5 pb-2.5 pt-8">
                  <p className="truncate text-[14px] font-semibold text-primary-foreground">
                    {d.nameId}
                  </p>
                  <p className="truncate text-[11px] text-primary-foreground/85">
                    Lihat paket eSIM live
                  </p>
                </div>
              </Link>
            ))}
        </div>
      </section>

      <section className="mt-7">
        <SectionTitle>Kebutuhan Perjalananmu</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {services.map(({ icon: I, label, sub, to }) => {
            const body = (
              <>
                <span
                  className={`flex size-10 items-center justify-center rounded-full ${to ? "bg-surface text-brand-red" : "bg-secondary"}`}
                >
                  <I className="size-5" strokeWidth={1.8} />
                </span>
                <span className="mt-2 text-[14px] font-semibold text-foreground">{label}</span>
                <span className="text-[11px]">{sub}</span>
              </>
            );
            const cls = "flex h-28 flex-col items-center justify-center rounded-2xl text-center";
            return to ? (
              <Link
                key={label}
                to={to}
                className={`tap ${cls} border-2 border-brand-red bg-brand-red-soft text-brand-red`}
              >
                {body}
              </Link>
            ) : (
              <div
                key={label}
                className={`${cls} border-2 border-transparent bg-surface text-muted-foreground`}
              >
                {body}
              </div>
            );
          })}
        </div>
      </section>

      {active ? (
        <section className="mt-7">
          <SectionTitle action={<Link to="/my-esim">Lihat Semua ›</Link>}>
            Perjalananmu
          </SectionTitle>
          <Link
            to="/my-esim/$id"
            params={{ id: active.id }}
            className="tap block rounded-2xl bg-surface p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-3xl">🌐</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{activeName}</p>
                <p className="text-[13px] text-muted-foreground">
                  {activeLocation} · {activeQuota} · {activeDuration} hari
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </div>
          </Link>
        </section>
      ) : (
        <Link
          to="/catalog"
          className="tap mt-7 flex items-center gap-3 rounded-2xl bg-brand-red-soft p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Cari Paket yang Cocok</p>
            <p className="truncate text-[13px] text-muted-foreground">
              Masukkan tanggal & kebutuhanmu
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-brand-red" />
        </Link>
      )}
    </Page>
  );
}
