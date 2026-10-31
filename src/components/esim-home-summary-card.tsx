import { ChevronRight, Search } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AnimatePresence,
  motion,
  animate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type PanInfo,
} from "motion/react";
import { EsimActivationStepper } from "@/components/esim-activation-stepper";
import { QuotaRing } from "@/components/esim-quota-ring";
import { EsimStatusBadge } from "@/components/esim-status-badge";
import { destinationArt, stateArt } from "@/lib/destination-art";
import {
  buildEsimHomeSummary,
  esimHomeOrderLocation,
  sortEsimHomeOrders,
  type EsimHomeSummary,
  type EsimHomeTarget,
} from "@/lib/esim-home-summary";
import { DEFAULT_HOME_ESIM_CONFIG, type HomeEsimConfig } from "@/lib/home-esim-config";
import { springIos, springSnappy } from "@/lib/motion";
import { readTripPlan } from "@/lib/travel-checklist-store";
import {
  calendarDaysUntil,
  departureLabel,
  formatGb,
  parseDepartureDate,
} from "@/lib/travel-journey";
import { effectiveOrderStatus } from "@/lib/esim-status";
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
const CARD_CLASS =
  "overflow-hidden rounded-[28px] border border-border/60 bg-surface shadow-[0_14px_32px_-24px_rgba(0,0,0,0.35)]";
const BTN =
  "tap flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-[14px] font-bold";

function ActionLink({
  action,
  tone,
  pulse,
}: {
  action: { label: string; target: EsimHomeTarget };
  tone: "primary" | "soft";
  pulse?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="flex min-w-0 flex-1"
      {...(pulse && !reduce
        ? {
            animate: {
              boxShadow: ["0 0 0 0 rgba(182,61,75,.45)", "0 0 0 12px rgba(182,61,75,0)"],
            },
          }
        : {})}
      transition={{ duration: 1.6, repeat: 1, ease: "easeOut" }}
      style={{ borderRadius: 16 }}
    >
      <SummaryLink
        target={action.target}
        ariaLabel={action.label}
        className={`${BTN} ${FOCUS} w-full ${
          tone === "primary"
            ? "bg-brand-red text-white"
            : "bg-surface text-foreground shadow-[inset_0_0_0_1px_rgba(60,60,67,0.16)]"
        }`}
      >
        {action.label}
      </SummaryLink>
    </motion.span>
  );
}

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
    <span ref={host} className="absolute right-3 top-2 size-[72px]">
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

function metaLine(summary: EsimHomeSummary, order: Order | undefined): string {
  if (summary.kind === "active" || summary.kind === "low") {
    return [
      summary.dataLabel,
      order?.durationDays ? `${order.durationDays} hari` : null,
      summary.expiresLabel,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (summary.kind === "ready") {
    return [
      summary.dataLabel,
      order?.durationDays ? `${order.durationDays} hari` : null,
      "Aktif setelah dipasang",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (summary.kind === "pending") {
    return [
      order?.packageName ?? order?.packageId,
      summary.orderCode ? `Pesanan ${summary.orderCode}` : null,
      summary.amountLabel,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return summary.subtitle;
}

/**
 * "Berangkat H-12" from the departure date the customer saved on the eSIM detail (the same
 * `readTripPlan` store the detail checklist writes). Read after mount: it lives in localStorage.
 */
function useDepartureLine(orderId: string | undefined, enabled: boolean): string | null {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (!orderId || !enabled) {
      setLine(null);
      return;
    }
    const at = parseDepartureDate(readTripPlan(orderId).departureDate);
    if (at === null) {
      setLine(null);
      return;
    }
    const days = calendarDaysUntil(at);
    setLine(days >= 0 ? `Berangkat · ${departureLabel(days)}` : null);
  }, [orderId, enabled]);
  return line;
}

function orderArtCode(order: Order | undefined): string {
  const codes = order?.locationCodes ?? [];
  return codes.length === 1 ? (codes[0] ?? "") : codes.length > 1 ? "GLOBAL" : "";
}

export function EsimHomeSummaryCard({
  orders,
  onSearchPackages,
  destinations = [],
  onSelectDestination,
  config = DEFAULT_HOME_ESIM_CONFIG,
}: {
  orders: Order[] | null;
  onSearchPackages: () => void;
  /** Rail entries, already ordered by the Admin config. */
  destinations?: HomeRailDestination[];
  onSelectDestination?: (destination: HomeRailDestination) => void;
  config?: HomeEsimConfig;
}) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);
  const dragged = useRef(false);
  const reduce = useReducedMotion();
  const departureOrderId =
    orders && orders.length > 0
      ? (selectedOrderId ?? buildEsimHomeSummary(orders, Date.now(), config.lowQuotaPercent).target)
      : undefined;
  const departureId =
    typeof departureOrderId === "string"
      ? departureOrderId
      : departureOrderId && "id" in departureOrderId
        ? departureOrderId.id
        : undefined;
  const departureLine = useDepartureLine(departureId, true);

  if (orders === null) {
    return (
      <section
        data-testid="esim-home-summary-loading"
        aria-busy="true"
        aria-label="Menyiapkan eSIM kamu"
        className={`${CARD_CLASS} p-4`}
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

  const lowPercent = config.lowQuotaPercent;
  const now = Date.now();
  const ordered = sortEsimHomeOrders(
    orders.filter((order) => {
      const status = effectiveOrderStatus(order.status, order.expiresAt, now);
      return status !== "EXPIRED" && status !== "CANCELLED" && status !== "REFUNDED";
    }),
    now,
    lowPercent,
  );
  const prioritySummary = buildEsimHomeSummary(orders, now, lowPercent);
  const selectedOrder =
    selectedOrderId && ordered.some((order) => order.id === selectedOrderId)
      ? orders.find((order) => order.id === selectedOrderId)
      : undefined;
  const summary = selectedOrder
    ? buildEsimHomeSummary([selectedOrder], now, lowPercent)
    : prioritySummary;
  const priorityTarget = prioritySummary.target;
  const displayedOrder =
    selectedOrder ??
    (priorityTarget.kind === "detail" || priorityTarget.kind === "order"
      ? orders.find((order) => order.id === priorityTarget.id)
      : ordered[0]);

  if (summary.kind === "empty") {
    const quick = config.quickBuyEnabled && destinations.length > 0 && onSelectDestination;
    return (
      <article
        data-testid="esim-home-summary"
        data-state="empty"
        className={`${CARD_CLASS} relative p-4`}
      >
        <p className="text-[12px] font-semibold text-muted-foreground">eSIM perjalanan</p>
        <ChipArt />
        <h2 className="mt-1.5 max-w-[11rem] text-[21px] font-bold leading-[1.15] tracking-[-0.03em] text-foreground">
          {summary.title}
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{summary.subtitle}</p>

        {quick ? (
          <>
            <div
              role="group"
              aria-label="Pilih tujuan"
              className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {destinations.map((destination, index) => (
                <motion.button
                  key={destination.code}
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`Lihat paket eSIM ${destination.nameId}`}
                  onClick={() => onSelectDestination(destination)}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springIos, delay: reduce ? 0 : index * 0.04 }}
                  {...(reduce ? {} : { whileTap: { scale: 0.94 } })}
                  className={`tap flex min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-secondary py-1.5 pl-2.5 pr-3.5 text-[14px] font-semibold ${FOCUS}`}
                >
                  <span className="text-[22px] leading-none" aria-hidden="true">
                    {destination.flag}
                  </span>
                  {destination.nameId}
                </motion.button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-end">
              <SummaryLink
                target={{ kind: "finder" }}
                ariaLabel="Semua paket eSIM"
                className={`tap flex min-h-11 items-center gap-0.5 rounded-xl px-1 text-[13px] font-semibold text-brand-red ${FOCUS}`}
              >
                Semua paket
                <ChevronRight className="size-4" aria-hidden="true" />
              </SummaryLink>
            </div>
          </>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={onSearchPackages}
              aria-haspopup="dialog"
              className={`${BTN} ${FOCUS} bg-brand-red text-white`}
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              {summary.primaryAction.label}
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
      </article>
    );
  }

  const activeOrderId = displayedOrder?.id ?? "";
  const status = displayedOrder
    ? effectiveOrderStatus(displayedOrder.status, displayedOrder.expiresAt, now)
    : "ORDER_CREATED";
  const art = destinationArt(orderArtCode(displayedOrder));
  const artSrc = stateArt(summary.kind) ?? art.src;
  const secondaryAction =
    summary.secondaryAction &&
    !(orders.length > 1 && summary.secondaryAction.target.kind === "list")
      ? summary.secondaryAction
      : undefined;
  const primaryTone = summary.kind === "active" ? "soft" : "primary";
  const peeks = Math.min(2, ordered.length - 1);

  const pageLabel = (order: Order) => {
    const parts = [esimHomeOrderLocation(order)];
    if (order.unlimited) parts.push("Unlimited");
    else if (order.volumeBytes && order.volumeBytes > 0) parts.push(formatGb(order.volumeBytes));
    return parts.join(" ");
  };

  const select = (order: Order | undefined) => {
    if (!order) return;
    const from = ordered.findIndex((item) => item.id === activeOrderId);
    const to = ordered.findIndex((item) => item.id === order.id);
    setDirection(to >= from ? 1 : -1);
    setSelectedOrderId(order.id);
  };

  const handlePagerKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key) || ordered.length < 2) return;
    event.preventDefault();
    const index = ordered.findIndex((order) => order.id === activeOrderId);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % ordered.length;
    if (event.key === "ArrowLeft") next = (index - 1 + ordered.length) % ordered.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = ordered.length - 1;
    select(ordered[next]);
    const buttons = event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
    buttons[next]?.focus();
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    window.setTimeout(() => {
      dragged.current = false;
    }, 0);
    if (ordered.length < 2 || Math.abs(info.offset.x) < 40) return;
    const index = ordered.findIndex((order) => order.id === activeOrderId);
    const step = info.offset.x < 0 ? 1 : -1;
    select(ordered[(index + step + ordered.length) % ordered.length]);
  };

  const measured = summary.kind === "active" || summary.kind === "low";
  const progress = summary.remainingPercent;

  return (
    <article data-testid="esim-home-summary" data-state={summary.kind} className="rounded-[28px]">
      <div className="relative" style={{ paddingBottom: peeks * 10 }}>
        {Array.from({ length: peeks }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            onClick={() =>
              select(
                ordered[
                  (ordered.findIndex((o) => o.id === activeOrderId) + index + 1) % ordered.length
                ],
              )
            }
            className="absolute inset-x-0 top-0 bottom-0 rounded-[26px] border border-border/60 bg-surface shadow-[0_10px_20px_-18px_rgba(0,0,0,0.35)]"
            style={{
              transform: `translateY(${(index + 1) * 10}px) scale(${1 - (index + 1) * 0.05})`,
              zIndex: 0,
              opacity: 1 - index * 0.25,
            }}
          />
        ))}
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={activeOrderId || summary.kind}
            custom={direction}
            initial={reduce ? false : { opacity: 0, x: direction * 48, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -48, scale: 0.97 }}
            transition={reduce ? { duration: 0.12 } : springIos}
            drag={ordered.length > 1 && !reduce ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragStart={() => {
              dragged.current = true;
            }}
            onDragEnd={onDragEnd}
            style={{ touchAction: "pan-y", zIndex: 1 }}
            className={`relative overflow-hidden rounded-[26px] border border-border/60 p-4 shadow-[0_14px_28px_-22px_rgba(0,0,0,0.4)] ${art.tint}`}
          >
            <SummaryLink
              target={summary.target}
              ariaLabel={
                summary.target.kind === "order"
                  ? "Buka status pesanan eSIM"
                  : `Buka detail eSIM ${summary.location ?? ""}`.trim()
              }
              onClick={() => undefined}
              className={`absolute inset-0 z-10 rounded-[26px] ${FOCUS}`}
            >
              <span className="sr-only">Buka</span>
            </SummaryLink>
            {artSrc && (
              <img
                src={artSrc}
                alt=""
                width={96}
                height={96}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="pointer-events-none absolute -right-2 top-6 size-24 object-contain opacity-90"
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-muted-foreground">eSIM kamu</p>
              <EsimStatusBadge status={status} low={summary.kind === "low"} />
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[19px] font-bold leading-tight tracking-[-0.025em] text-foreground">
                  {summary.kind === "active" ||
                  summary.kind === "low" ||
                  summary.kind === "ready" ? (
                    <>
                      <span aria-hidden="true">{summary.flag}</span>{" "}
                      {summary.location ?? summary.title}
                    </>
                  ) : (
                    summary.title
                  )}
                </p>
                <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
                  {metaLine(summary, displayedOrder)}
                </p>
              </div>
              {measured && progress !== null && (
                <QuotaRing
                  percent={progress}
                  label={summary.quotaCaption?.includes("<1%") ? "<1%" : `${progress}%`}
                  valueText={summary.quotaLabel ?? `${progress}%`}
                  low={summary.kind === "low"}
                  size={64}
                  testId="esim-home-summary-progress"
                />
              )}
            </div>

            {measured &&
              (summary.quotaValue ? (
                <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                  <span className="text-[26px] font-bold tracking-[-0.035em] text-foreground">
                    {summary.quotaValue}
                  </span>{" "}
                  {summary.quotaCaption}
                </p>
              ) : (
                <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                  {summary.quotaLabel}
                </p>
              ))}
            {measured && summary.measuredAt !== undefined && (
              <p className="mt-1 text-[10.5px] text-muted-foreground/80">
                Data penyedia · diperbarui {snapshotAgeLabel(summary.measuredAt)}
              </p>
            )}

            {summary.kind === "ready" && (
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                Pindai QR atau salin detail eSIM sebelum berangkat.
              </p>
            )}
            {(summary.kind === "ready" || measured) && departureLine && (
              <p
                data-testid="esim-home-departure"
                className="mt-1.5 text-[12px] font-semibold text-foreground"
              >
                {departureLine}
              </p>
            )}

            {summary.kind === "pending" && (
              <div className="mt-3">
                <EsimActivationStepper status={status} />
                <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                  {status === "ORDER_CREATED" || status === "WAITING_PAYMENT"
                    ? "Selesaikan pembayaran sebelum pesanan dibatalkan."
                    : summary.eyebrow === "Butuh bantuan"
                      ? "Hubungi dukungan agar eSIM bisa disiapkan ulang."
                      : "Kami sedang menyiapkan eSIM-mu. Cek status secara berkala."}
                </p>
              </div>
            )}

            {summary.kind === "history" && (
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                Masa aktif paket ini sudah berakhir. Beli paket lagi untuk terhubung kembali.
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {ordered.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Pilih eSIM"
          onKeyDown={handlePagerKeys}
          className="flex items-center justify-center"
        >
          {ordered.map((order) => {
            const checked = order.id === activeOrderId;
            return (
              <button
                key={order.id}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                aria-label={`eSIM ${pageLabel(order)}`}
                onClick={() => select(order)}
                className={`tap grid h-11 min-w-8 place-items-center rounded-full ${FOCUS}`}
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

      <div className="mt-1 flex gap-2">
        <ActionLink
          action={summary.primaryAction}
          tone={primaryTone}
          pulse={summary.kind === "low"}
        />
        {secondaryAction && <ActionLink action={secondaryAction} tone="soft" />}
      </div>
      {orders.length > 1 && (
        <SummaryLink
          target={{ kind: "list" }}
          ariaLabel="Lihat semua eSIM"
          className={`tap mt-1 flex min-h-11 items-center justify-center gap-0.5 rounded-xl text-[13px] font-semibold text-muted-foreground ${FOCUS}`}
        >
          Lihat semua eSIM
          <ChevronRight className="size-4" aria-hidden="true" />
        </SummaryLink>
      )}
    </article>
  );
}
