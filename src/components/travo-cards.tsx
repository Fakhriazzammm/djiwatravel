import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { DjiwaPayTopup } from "@/components/djiwa-pay-topup";
import { EsimCheckoutSheet } from "@/components/esim-checkout-sheet";
import { EsimQr, InstallGuide, ManualDetails } from "@/components/esim-install";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DEFAULT_MINIMUM_TOPUP, DEFAULT_TOPUP_PRESETS } from "@/lib/customer-app-config";
import { postTrip } from "@/lib/my-trips.fn";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import type { TravoChatState } from "@/hooks/use-travo-chat";
import type { TravoCard } from "@/lib/trip-assistant";

const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;
const dayTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const label = "px-3 pt-2 text-[11px] font-bold uppercase text-muted-foreground";
const row = "flex min-h-12 items-center gap-2 border-t border-border/60 px-3 py-2";
const primary =
  "tap inline-flex min-h-9 shrink-0 items-center rounded-xl bg-brand-red px-3 text-[13px] font-semibold text-white";
const soft =
  "tap inline-flex min-h-9 shrink-0 items-center rounded-xl bg-secondary px-3 text-[12px] font-semibold";

/**
 * Live product cards under an answer. Everything can be done from here: eSIM plans open the real
 * checkout in a sheet over the chat, flights show real fares, guides and trips open in place.
 */
export function TravoCards({ cards, chat }: { cards: TravoCard[]; chat: TravoChatState }) {
  const [buying, setBuying] = useState<string | null>(null);
  const [installing, setInstalling] = useState<
    Extract<TravoCard, { kind: "pesanan" }>["orders"][number] | null
  >(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [created, setCreated] = useState<Record<number, string>>({});
  const [busyCard, setBusyCard] = useState<number | null>(null);
  const { user } = useBetterAuthUser();

  async function createTripFrom(index: number, card: Extract<TravoCard, { kind: "buat_trip" }>) {
    setBusyCard(index);
    try {
      const trip = (await postTrip({
        data: {
          name: card.name,
          destinationCode: card.destinationCode,
          destinationName: card.destinationName,
          departureDate: card.departureDate,
          returnDate: card.returnDate,
          travelersCount: card.travelers,
          primaryCurrency: "IDR",
          totalBudgetMinor: 0,
        },
      })) as { id: string };
      setCreated((c) => ({ ...c, [index]: trip.id }));
      toast.success("Trip dibuat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Trip belum bisa dibuat.");
    } finally {
      setBusyCard(null);
    }
  }

  return (
    <>
      {cards.map((card, index) => {
        if (card.kind === "esim")
          return (
            <section
              key={index}
              data-testid="travo-card-esim"
              className="border-t border-border/60"
            >
              <p className={label}>
                {card.destination.flag} eSIM {card.destination.name}
                {card.fromPriceIdr ? ` · mulai ${rupiah(card.fromPriceIdr)}` : ""}
              </p>
              {card.picks.map((pick) => (
                <div key={pick.packageCode} className={row}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      {pick.dataLabel} · {pick.days} hari
                      {pick.tag && (
                        <span className="ml-1.5 rounded-full bg-brand-red-soft px-1.5 py-0.5 text-[10px] font-bold text-brand-red">
                          {pick.tag}
                        </span>
                      )}
                    </p>
                    <p className="text-[12px] font-bold text-brand-red">{rupiah(pick.priceIdr)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBuying(pick.packageCode)}
                    className={primary}
                  >
                    {pick.preorder ? "Pre-order" : "Beli"}
                  </button>
                </div>
              ))}
              {card.total > card.picks.length && (
                <div className="border-t border-border/60 px-3 py-2">
                  <button
                    type="button"
                    disabled={chat.sending}
                    onClick={() =>
                      void chat.send(
                        `Tampilkan pilihan paket eSIM ${card.destination.name} yang lain`,
                      )
                    }
                    className={soft}
                  >
                    Paket lain ({card.total - card.picks.length}+)
                  </button>
                </div>
              )}
            </section>
          );
        if (card.kind === "tiket")
          return (
            <section
              key={index}
              data-testid="travo-card-tiket"
              className="border-t border-border/60"
            >
              <p className={label}>
                Tiket {card.from} → {card.to} · {dayTime(card.date).split(",")[0]}
              </p>
              {card.status !== "ok" ? (
                <div className={row}>
                  <p className="flex-1 text-[12px] text-muted-foreground">
                    {card.status === "empty"
                      ? "Belum ada harga untuk tanggal itu. Coba tanggal lain."
                      : card.status === "login_required"
                        ? "Masuk dulu untuk mencari tiket."
                        : "Pencarian tiket belum tersedia. Coba lagi sebentar lagi."}
                  </p>
                </div>
              ) : (
                card.offers.map((o) => (
                  <div key={`${o.flightNumber}-${o.departureAt}`} className={row}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">
                        {o.airline} {o.flightNumber}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {dayTime(o.departureAt)} ·{" "}
                        {o.transfers === 0 ? "langsung" : `${o.transfers} transit`}
                      </p>
                      <p className="text-[12px] font-bold text-brand-red">{rupiah(o.priceIdr)}</p>
                    </div>
                    {o.url && (
                      <a
                        href={o.url}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className={primary}
                      >
                        Pesan <ExternalLink className="ml-1 size-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                ))
              )}
              <div className="border-t border-border/60 px-3 py-2">
                <Link to={card.searchPath as never} className={soft}>
                  Bandingkan semua harga
                </Link>
              </div>
            </section>
          );
        if (card.kind === "panduan")
          return (
            <section
              key={index}
              data-testid="travo-card-panduan"
              className="border-t border-border/60"
            >
              <p className={label}>Panduan</p>
              {card.guides.map((g) => (
                <Link
                  key={g.slug}
                  to="/panduan/$slug"
                  params={{ slug: g.slug }}
                  className={`${row} tap`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{g.title}</span>
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">
                      {g.description} · {g.readTime}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </section>
          );
        if (card.kind === "pesanan")
          return (
            <section
              key={index}
              data-testid="travo-card-pesanan"
              className="border-t border-border/60"
            >
              <p className={label}>Pesanan eSIM</p>
              {!card.loggedIn ? (
                <div className={row}>
                  <p className="flex-1 text-[12px] text-muted-foreground">
                    Masuk untuk melihat pesanan eSIM kamu.
                  </p>
                  <Link to="/profile" search={{ returnTo: "/travo" } as never} className={primary}>
                    Masuk
                  </Link>
                </div>
              ) : card.orders.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-muted-foreground">
                  Belum ada pesanan eSIM.
                </p>
              ) : (
                card.orders.map((o) => (
                  <div key={o.id} className={row}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{o.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {o.statusLabel}
                        {o.usagePercent !== null ? ` · terpakai ${o.usagePercent}%` : ""}
                      </p>
                    </div>
                    {o.esim ? (
                      <button type="button" onClick={() => setInstalling(o)} className={primary}>
                        Pasang
                      </button>
                    ) : o.needsPayment ? (
                      <Link to="/order/$id" params={{ id: o.id }} className={primary}>
                        Bayar
                      </Link>
                    ) : (
                      <button type="button" onClick={() => setBuying(o.packageId)} className={soft}>
                        Beli lagi
                      </button>
                    )}
                  </div>
                ))
              )}
            </section>
          );
        if (card.kind === "dompet")
          return (
            <section
              key={index}
              data-testid="travo-card-dompet"
              className="border-t border-border/60"
            >
              <p className={label}>Saldo Djiwa Pay</p>
              <div className={row}>
                {card.status === "ok" ? (
                  <>
                    <p className="flex-1 text-[20px] font-bold">{rupiah(card.balanceIdr ?? 0)}</p>
                    <button type="button" onClick={() => setTopupOpen(true)} className={primary}>
                      Top up
                    </button>
                  </>
                ) : card.status === "login_required" ? (
                  <>
                    <p className="flex-1 text-[12px] text-muted-foreground">
                      Masuk untuk melihat saldo.
                    </p>
                    <Link
                      to="/profile"
                      search={{ returnTo: "/travo" } as never}
                      className={primary}
                    >
                      Masuk
                    </Link>
                  </>
                ) : (
                  <p className="flex-1 text-[12px] text-muted-foreground">
                    Saldo belum bisa dimuat. Coba lagi sebentar lagi.
                  </p>
                )}
              </div>
              {card.status === "ok" && user && (
                <DjiwaPayTopup
                  userId={user.id}
                  open={topupOpen}
                  onOpenChange={setTopupOpen}
                  creditedBefore={card.creditedIdr ?? 0}
                  presets={DEFAULT_TOPUP_PRESETS}
                  minimum={DEFAULT_MINIMUM_TOPUP}
                  onSubmitted={() => setTopupOpen(false)}
                />
              )}
            </section>
          );
        if (card.kind === "buat_trip")
          return (
            <section
              key={index}
              data-testid="travo-card-buat-trip"
              className="border-t border-border/60"
            >
              <p className={label}>Buat trip baru</p>
              <div className={row}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{card.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {card.destinationName} · {card.departureDate} – {card.returnDate} ·{" "}
                    {card.travelers} orang
                  </p>
                </div>
                {created[index] ? (
                  <Link to="/travo" search={{ trip: created[index] } as never} className={primary}>
                    Lanjut di chat
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busyCard === index}
                    onClick={() => void createTripFrom(index, card)}
                    className={`${primary} disabled:opacity-50`}
                  >
                    {busyCard === index ? "Membuat…" : "Buat trip"}
                  </button>
                )}
              </div>
            </section>
          );
        if (card.kind === "titip")
          return (
            <section
              key={index}
              data-testid="travo-card-titip"
              className="border-t border-border/60"
            >
              <p className={label}>Titip belanja {card.country}</p>
              {!card.open ? (
                <p className="px-3 py-3 text-[12px] text-muted-foreground">
                  Titip belanja untuk negara ini sedang tutup.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 px-3 py-2">
                  {card.products.map((p) => (
                    <Link
                      key={p.id}
                      to="/titip-belanja"
                      className="tap overflow-hidden rounded-xl bg-secondary"
                    >
                      {p.imageUrl && (
                        <img
                          src={p.imageUrl}
                          alt=""
                          loading="lazy"
                          className="aspect-square w-full object-cover"
                        />
                      )}
                      <span className="block truncate px-2 pt-1 text-[12px] font-semibold">
                        {p.name}
                      </span>
                      <span className="block px-2 pb-1.5 text-[11px] text-muted-foreground">
                        {p.price.toLocaleString("id-ID")}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {card.orders.map((o) => (
                <Link
                  key={o.id}
                  to="/titip-belanja/pesanan/$id"
                  params={{ id: o.id }}
                  className={`${row} tap`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">
                      Pesanan {o.code}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {o.statusLabel} · {rupiah(o.totalIdr)}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </section>
          );
        return (
          <section key={index} data-testid="travo-card-trip" className="border-t border-border/60">
            <p className={label}>Trip kamu</p>
            {card.trips.map((t) => (
              <Link
                key={t.id}
                to="/travo"
                search={{ trip: t.id } as never}
                className={`${row} tap`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{t.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {t.destination}
                    {t.from ? ` · ${t.from}` : ""}
                    {t.to ? ` – ${t.to}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-brand-red">
                  Lanjut di chat
                </span>
              </Link>
            ))}
          </section>
        );
      })}
      <EsimCheckoutSheet packageCode={buying} onClose={() => setBuying(null)} />
      <Sheet open={installing !== null} onOpenChange={(open) => !open && setInstalling(null)}>
        <SheetContent
          side="bottom"
          data-testid="travo-install-sheet"
          className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-6"
        >
          <SheetHeader className="mb-3 pr-10 text-left">
            <SheetTitle>Pasang eSIM</SheetTitle>
            <SheetDescription>{installing?.name}</SheetDescription>
          </SheetHeader>
          {installing?.esim && (
            <div className="space-y-4">
              <EsimQr esim={installing.esim} />
              <ManualDetails esim={installing.esim} iccid />
              <InstallGuide />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
