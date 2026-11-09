import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink } from "lucide-react";
import { EsimCheckoutSheet } from "@/components/esim-checkout-sheet";
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
    </>
  );
}
