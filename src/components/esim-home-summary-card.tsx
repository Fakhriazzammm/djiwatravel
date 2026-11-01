import { ChevronRight, Search } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { EsimActivationStepper } from "@/components/esim-activation-stepper";
import { EsimCheckoutSheet } from "@/components/esim-checkout-sheet";
import { EsimQuickBuyPanel } from "@/components/esim-quick-buy-panel";
import { EsimStatusBadge } from "@/components/esim-status-badge";
import type { EsimHomeTarget } from "@/lib/esim-home-summary";
import { buildEsimWalletCards, type EsimWalletCard } from "@/lib/esim-home-wallet";
import { DEFAULT_HOME_ESIM_CONFIG, type HomeEsimConfig } from "@/lib/home-esim-config";
import { springIos, springSnappy } from "@/lib/motion";
import { readTripPlan, TRIP_PLANS_EVENT } from "@/lib/travel-checklist-store";
import { calendarDaysUntil, departureLabel, parseDepartureDate } from "@/lib/travel-journey";
import { snapshotAgeLabel } from "@/lib/offline-travel-snapshot";
import type { Order } from "@/lib/orders";

export type HomeRailDestination = { code: string; flag: string; nameId: string };

function SummaryLink({
  target,
  children,
  className,
  ariaLabel,
  onClick,
}: {
  target: EsimHomeTarget;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  onClick?: () => void;
}) {
  const props = { className, "aria-label": ariaLabel, onClick };
  switch (target.kind) {
    case "finder":
      return (
        <Link to="/esim/finder" {...props}>
          {children}
        </Link>
      );
    case "list":
      return (
        <Link to="/my-esim" {...props}>
          {children}
        </Link>
      );
    case "detail":
      return (
        <Link to="/my-esim/$id" params={{ id: target.id }} {...props}>
          {children}
        </Link>
      );
    case "order":
      return (
        <Link to="/order/$id" params={{ id: target.id }} {...props}>
          {children}
        </Link>
      );
    case "checkout":
      return (
        <Link to="/checkout/$id" params={{ id: target.id }} {...props}>
          {children}
        </Link>
      );
  }
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CARD_CLASS = "ios-card overflow-hidden rounded-[28px]";
const BTN =
  "tap flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-3 text-[14px] font-bold";

/**
 * The empty-state eSIM illustration. Motion explains that it is a physical object you can handle:
 * it springs in once, tilts toward the pointer (hover anywhere on the card, or press and drag on a
 * touch screen), and a tap flips it with a one-shot signal pulse. Nothing loops, and reduced
 * motion gets a static image.
 */
function ChipArt() {
  const reduce = useReducedMotion();
  const host = useRef<HTMLSpanElement>(null);
  const rx = useSpring(useMotionValue(0), springSnappy);
  const ry = useSpring(useMotionValue(0), springSnappy);
  const spin = useMotionValue(0);
  const rotateY = useTransform([ry, spin], ([tilt, turn]: number[]) => (tilt ?? 0) + (turn ?? 0));
  const shadow = useTransform(
    [rx, ry],
    ([x, y]: number[]) =>
      `drop-shadow(${-(y ?? 0) * 0.35}px ${4 + (x ?? 0) * -0.3}px 6px rgba(0,0,0,0.18))`,
  );
  const [pulse, setPulse] = useState(0);
  const pressed = useRef(false);

  // Hover anywhere on the card steers the chip, not just the 56 px image.
  useEffect(() => {
    const card = host.current?.parentElement;
    if (!card || reduce) return;
    const steer = (clientX: number, clientY: number) => {
      const box = host.current?.getBoundingClientRect();
      if (!box) return;
      const dx = (clientX - (box.left + box.width / 2)) / Math.max(box.width * 3, 1);
      const dy = (clientY - (box.top + box.height / 2)) / Math.max(box.height * 3, 1);
      ry.set(Math.max(-1, Math.min(1, dx)) * 32);
      rx.set(-Math.max(-1, Math.min(1, dy)) * 32);
    };
    const relax = () => {
      rx.set(0);
      ry.set(0);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || pressed.current) steer(event.clientX, event.clientY);
    };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", relax);
    return () => {
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerleave", relax);
    };
  }, [reduce, rx, ry]);

  const flip = () => {
    if (reduce) return;
    spin.set(0);
    void animate(spin, 360, { ...springIos, duration: 0.9 }).then(() => spin.set(0));
    setPulse((value) => value + 1);
    navigator.vibrate?.(8);
  };

  return (
    <span ref={host} className="absolute right-3 top-2.5 size-11">
      {pulse > 0 &&
        [0, 1].map((ring) => (
          <motion.span
            key={`${pulse}-${ring}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-2 rounded-full border-2 border-brand-red/40"
            initial={{ opacity: 0.7, scale: 0.7 }}
            animate={{ opacity: 0, scale: 1.7 }}
            transition={{ duration: 1, delay: ring * 0.18, ease: "easeOut" }}
          />
        ))}
      <motion.button
        type="button"
        aria-label="Putar ilustrasi eSIM"
        onClick={flip}
        onPointerDown={() => {
          pressed.current = true;
        }}
        onPointerUp={() => {
          pressed.current = false;
          rx.set(0);
          ry.set(0);
        }}
        onPointerCancel={() => {
          pressed.current = false;
        }}
        initial={reduce ? false : { opacity: 0, scale: 0.55, rotate: -14, y: 10 }}
        animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
        transition={reduce ? { duration: 0 } : { ...springIos, stiffness: 220, damping: 15 }}
        {...(reduce ? {} : { whileTap: { scale: 0.9 } })}
        className={`tap relative size-full rounded-2xl ${FOCUS}`}
        style={{ touchAction: "pan-y" }}
      >
        <motion.img
          src="/assets/esim/esim-pass-global-v1.webp"
          alt=""
          width={192}
          height={192}
          loading="eager"
          decoding="async"
          draggable={false}
          style={{ rotateX: rx, rotateY, transformPerspective: 320, filter: shadow }}
          className="size-full select-none object-contain"
        />
      </motion.button>
    </span>
  );
}

/**
 * "Berangkat H-12" from the departure date the customer saved on the eSIM detail (the same
 * `readTripPlan` store the detail checklist writes). Read after mount: it lives in localStorage.
 */
function DepartureLine({ orderId }: { orderId: string }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const at = parseDepartureDate(readTripPlan(orderId).departureDate);
      if (at === null) {
        setLine(null);
        return;
      }
      const days = calendarDaysUntil(at);
      setLine(days >= 0 ? `Berangkat · ${departureLabel(days)}` : null);
    };
    read();
    window.addEventListener(TRIP_PLANS_EVENT, read);
    return () => window.removeEventListener(TRIP_PLANS_EVENT, read);
  }, [orderId]);
  if (!line) return null;
  return (
    <p
      data-testid="esim-home-departure"
      className="mt-0.5 text-[11px] font-semibold text-foreground"
    >
      {line}
    </p>
  );
}

/** Stand-alone flag: no box behind it, the emoji is the artwork. */
function Flag({ flag, muted }: { flag: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 text-[22px] leading-none ${muted ? "grayscale" : ""}`}
    >
      {flag}
    </span>
  );
}

function QuotaBar({ card }: { card: EsimWalletCard }) {
  if (card.percent === null) return null;
  const fill = card.tone === "low" ? "bg-[#E0A100]" : "bg-brand-red";
  return (
    <div
      role="progressbar"
      aria-label={`Sisa kuota eSIM ${card.location}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={card.percent}
      data-testid="esim-home-summary-progress"
      className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[#E5E5EA]"
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${card.percent}%` }} />
    </div>
  );
}

function WalletCard({
  card,
  onBuy,
  readOnly,
}: {
  card: EsimWalletCard;
  onBuy: (packageId: string) => void;
  readOnly: boolean;
}) {
  const expired = card.kind === "expired";
  const surface =
    card.kind === "ready"
      ? "bg-gradient-to-br from-brand-red-soft to-surface shadow-[inset_0_0_0_1px_rgba(182,61,75,0.18)]"
      : expired
        ? "bg-secondary/70"
        : "bg-secondary/50 shadow-[inset_0_0_0_1px_rgba(60,60,67,0.08)]";
  const actionClass = `tap ${FOCUS} relative z-20 mt-2 flex min-h-9 w-full items-center justify-center rounded-full px-3 text-[13px] font-bold ${
    card.action.primary
      ? "bg-brand-red text-white"
      : "bg-surface text-brand-red shadow-[inset_0_0_0_1px_rgba(60,60,67,0.16)]"
  }`;
  return (
    <article
      data-testid="esim-wallet-card"
      data-kind={card.kind}
      aria-label={`eSIM ${card.location}`}
      className={`relative w-[84%] shrink-0 snap-start rounded-2xl p-2.5 ${surface} ${
        expired ? "text-muted-foreground" : ""
      }`}
    >
      <SummaryLink
        target={card.target}
        ariaLabel={
          card.target.kind === "order"
            ? `Buka status pesanan eSIM ${card.location}`
            : `Buka detail eSIM ${card.location}`
        }
        className={`absolute inset-0 z-10 rounded-2xl ${FOCUS}`}
      >
        <span className="sr-only">Buka</span>
      </SummaryLink>

      <div className="flex items-center gap-2">
        <Flag flag={card.flag} muted={expired} />
        <p className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.02em] text-foreground">
          {card.location}
        </p>
        <EsimStatusBadge status={card.status} low={card.kind === "low"} />
      </div>

      {card.kind === "pending" ? (
        <div className="mt-1.5">
          <p className="text-[14px] font-bold text-foreground">{card.pendingTitle}</p>
          <p className="text-[12px] text-muted-foreground">
            {[card.headline, card.caption].filter(Boolean).join(" ")}
          </p>
          <div className="mt-1.5">
            <EsimActivationStepper status={card.status} />
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
            <span
              className={`text-[19px] font-extrabold tracking-[-0.03em] ${
                expired ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {card.headline}
            </span>{" "}
            {card.caption}
          </p>
          <QuotaBar card={card} />
          {(card.usedLabel || card.timeLabel) && (
            <p className="mt-1 flex justify-between gap-2 text-[10.5px] font-semibold text-muted-foreground">
              <span>{card.usedLabel}</span>
              <span>{card.timeLabel}</span>
            </p>
          )}
          {card.measuredAt !== null && (
            <p className="text-[10px] text-muted-foreground/80">
              Data penyedia · diperbarui {snapshotAgeLabel(card.measuredAt)}
            </p>
          )}
          {(card.kind === "ready" || card.kind === "active" || card.kind === "low") && (
            <DepartureLine orderId={card.id} />
          )}
        </>
      )}

      {card.action.kind === "link" ? (
        <SummaryLink
          target={card.action.target}
          ariaLabel={`${card.action.label} ${card.location}`}
          className={actionClass}
        >
          {card.action.label}
        </SummaryLink>
      ) : (
        <button
          type="button"
          disabled={readOnly}
          aria-haspopup="dialog"
          aria-label={`${card.action.label} ${card.location}`}
          onClick={() => card.action.kind === "buy" && onBuy(card.action.packageId)}
          className={actionClass}
        >
          {card.action.label}
        </button>
      )}
    </article>
  );
}

/** The "eSIM kamu" rail: swipeable cards plus page dots that mirror the scroll position. */
function WalletRail({
  cards,
  onBuy,
  readOnly,
}: {
  cards: EsimWalletCard[];
  onBuy: (packageId: string) => void;
  readOnly: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  const onScroll = () => {
    const node = scroller.current;
    const first = node?.firstElementChild as HTMLElement | null;
    if (!node || !first) return;
    const step = first.offsetWidth + 10;
    setIndex(Math.max(0, Math.min(cards.length - 1, Math.round(node.scrollLeft / step))));
  };
  const goTo = (target: number) => {
    const node = scroller.current;
    const first = node?.firstElementChild as HTMLElement | null;
    if (!node || !first) return;
    node.scrollTo({
      left: target * (first.offsetWidth + 10),
      behavior: reduce ? "auto" : "smooth",
    });
    setIndex(target);
  };

  return (
    <section
      data-testid="esim-wallet-rail"
      aria-label="eSIM kamu"
      className="mt-2.5 border-t border-border/60 pt-2"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-bold">eSIM kamu</h3>
        {cards.length > 1 && (
          <span aria-hidden="true" className="text-[12px] font-semibold text-muted-foreground">
            Geser →
          </span>
        )}
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="-mx-3 mt-1.5 flex snap-x snap-mandatory scroll-px-3 gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card) => (
          <WalletCard key={card.id} card={card} onBuy={onBuy} readOnly={readOnly} />
        ))}
      </div>
      {cards.length > 1 && (
        <div role="radiogroup" aria-label="Pilih eSIM" className="flex items-center justify-center">
          {cards.map((card, position) => {
            const checked = position === index;
            return (
              <button
                key={card.id}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={`eSIM ${card.location}`}
                onClick={() => goTo(position)}
                className={`tap grid h-6 min-w-7 place-items-center rounded-full ${FOCUS}`}
              >
                <motion.span
                  aria-hidden="true"
                  animate={{ width: checked ? 18 : 6 }}
                  transition={reduce ? { duration: 0 } : springSnappy}
                  className={`h-1.5 rounded-full ${checked ? "bg-brand-red" : "bg-[#C7C7CC]"}`}
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function EsimHomeSummaryCard({
  orders,
  onSearchPackages,
  destinations = [],
  onSelectDestination,
  config = DEFAULT_HOME_ESIM_CONFIG,
  readOnly = false,
}: {
  orders: Order[] | null;
  onSearchPackages: () => void;
  /** Rail entries, already ordered by the Admin config. */
  destinations?: HomeRailDestination[];
  /** Called when a destination chip is opened (analytics); the packages open inside the card. */
  onSelectDestination?: (destination: HomeRailDestination) => void;
  config?: HomeEsimConfig;
  /** Admin preview: draws the card but never loads packages or opens checkout. */
  readOnly?: boolean;
}) {
  const reduce = useReducedMotion();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [checkoutCode, setCheckoutCode] = useState<string | null>(null);

  if (orders === null) {
    return (
      <section
        data-testid="esim-home-summary-loading"
        aria-busy="true"
        aria-label="Menyiapkan eSIM kamu"
        className={`${CARD_CLASS} p-3`}
      >
        <div className="h-3.5 w-24 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />
        <div className="mt-4 h-6 w-48 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />
        <div className="mt-2 h-3.5 w-40 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />
        <div className="mt-4 flex gap-2">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-11 w-24 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none"
            />
          ))}
        </div>
      </section>
    );
  }

  const cards = buildEsimWalletCards(orders, Date.now(), config.lowQuotaPercent);
  const quick = config.quickBuyEnabled && destinations.length > 0;
  const openDestination = destinations.find((item) => item.code === openCode);

  const toggle = (destination: HomeRailDestination) => {
    if (readOnly) return;
    if (openCode === destination.code) {
      setOpenCode(null);
      return;
    }
    setOpenCode(destination.code);
    onSelectDestination?.(destination);
  };

  return (
    <article
      data-testid="esim-home-summary"
      data-state={cards.length === 0 ? "empty" : "has-esim"}
      className={`${CARD_CLASS} relative p-3`}
    >
      <p className="text-[12px] font-semibold text-muted-foreground">eSIM perjalanan</p>
      <ChipArt />
      <h2 className="mt-0.5 pr-12 text-[17px] font-bold leading-tight tracking-[-0.025em] text-foreground">
        Mau ke mana berikutnya?
      </h2>
      <p className="text-[12px] leading-4 text-muted-foreground">
        Pilih tujuan, internet langsung siap.
      </p>

      {quick ? (
        <>
          <div
            role="group"
            aria-label="Pilih tujuan"
            className="-mx-3 mt-2 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {destinations.map((destination, index) => {
              const selected = destination.code === openCode;
              return (
                <motion.button
                  key={destination.code}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Lihat paket eSIM ${destination.nameId}`}
                  onClick={() => toggle(destination)}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springIos, delay: reduce ? 0 : index * 0.04 }}
                  {...(reduce ? {} : { whileTap: { scale: 0.94 } })}
                  className={`tap flex min-h-9 shrink-0 items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-[13px] font-semibold ${FOCUS} ${
                    selected
                      ? "bg-brand-red-soft text-brand-red shadow-[inset_0_0_0_2px_var(--color-brand-red)]"
                      : "bg-secondary"
                  }`}
                >
                  <span className="text-[17px] leading-none" aria-hidden="true">
                    {destination.flag}
                  </span>
                  {destination.nameId}
                </motion.button>
              );
            })}
            <SummaryLink
              target={{ kind: "finder" }}
              ariaLabel="Semua paket eSIM"
              className={`tap flex min-h-9 shrink-0 items-center gap-0.5 rounded-full px-2 text-[13px] font-semibold text-brand-red ${FOCUS}`}
            >
              Semua paket
              <ChevronRight className="size-4" aria-hidden="true" />
            </SummaryLink>
          </div>
          {openDestination && !readOnly && (
            <EsimQuickBuyPanel
              key={openDestination.code}
              destination={openDestination}
              onBuy={setCheckoutCode}
            />
          )}
        </>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onSearchPackages}
            aria-haspopup="dialog"
            className={`${BTN} ${FOCUS} bg-brand-red text-white`}
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            Cari paket eSIM
          </button>
          <SummaryLink
            target={{ kind: "finder" }}
            ariaLabel="Semua paket eSIM"
            className={`tap flex min-h-11 shrink-0 items-center gap-0.5 rounded-xl px-2 text-[13px] font-semibold ${FOCUS}`}
          >
            Semua paket
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </SummaryLink>
        </div>
      )}

      {cards.length > 0 && <WalletRail cards={cards} onBuy={setCheckoutCode} readOnly={readOnly} />}
      {cards.length > 1 && (
        <SummaryLink
          target={{ kind: "list" }}
          ariaLabel="Lihat semua eSIM"
          className={`tap flex min-h-8 items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold text-muted-foreground ${FOCUS}`}
        >
          Lihat semua eSIM
          <ChevronRight className="size-4" aria-hidden="true" />
        </SummaryLink>
      )}

      {!readOnly && (
        <EsimCheckoutSheet packageCode={checkoutCode} onClose={() => setCheckoutCode(null)} />
      )}
    </article>
  );
}
