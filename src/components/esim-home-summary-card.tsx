import { ChevronRight, Clock3, Globe2, QrCode, Search, Smartphone } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import {
  buildEsimHomeSummary,
  esimHomeOrderLocation,
  sortEsimHomeOrders,
  type EsimHomeSummary,
  type EsimHomeTarget,
} from "@/lib/esim-home-summary";
import { formatGb } from "@/lib/travel-journey";
import { effectiveOrderStatus } from "@/lib/esim-status";
import { snapshotAgeLabel } from "@/lib/offline-travel-snapshot";
import type { Order } from "@/lib/orders";

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

const ROW_CLASS =
  "tap flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[13.5px] leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const SUMMARY_CARD_CLASS =
  "overflow-hidden rounded-[24px] border border-border/60 bg-secondary shadow-[0_8px_24px_-22px_rgba(0,0,0,0.3)]";

function RowShell({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
    </>
  );
}

function ActionRow({
  action,
  emphasis,
}: {
  action: { label: string; target: EsimHomeTarget };
  emphasis?: boolean;
}) {
  return (
    <SummaryLink
      target={action.target}
      ariaLabel={action.label}
      className={`${ROW_CLASS} ${emphasis ? "font-bold text-brand-red" : "font-semibold text-[#172b4d]"}`}
    >
      <RowShell>{action.label}</RowShell>
    </SummaryLink>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "orange" | "blue" | "red" | "gray";
}) {
  const tones = {
    green: "bg-[#E8F6EE] text-[#1E7A4D]",
    orange: "bg-[#FFF4E5] text-[#9A5B00]",
    blue: "bg-[#E9F2FF] text-[#0057B8]",
    red: "bg-brand-red-soft text-brand-red",
    gray: "bg-secondary text-muted-foreground",
  } as const;
  const dots = {
    green: "bg-[#34C759]",
    orange: "bg-[#FF9F0A]",
    blue: "bg-[#0A84FF]",
    red: "bg-brand-red",
    gray: "bg-[#8E8E93]",
  } as const;

  return (
    <span
      data-testid="esim-home-summary-badge"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${tones[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dots[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function statusBadge(
  summary: EsimHomeSummary,
  order: Order | undefined,
): { label: string; tone: "green" | "orange" | "blue" | "red" | "gray" } {
  if (summary.kind === "active") return { label: "Aktif", tone: "green" };
  if (summary.kind === "low") return { label: "Kuota menipis", tone: "orange" };
  if (summary.kind === "ready") return { label: "Siap dipasang", tone: "blue" };
  if (summary.kind === "history") return { label: "Riwayat", tone: "gray" };

  const status = order?.status;
  if (status === "ORDER_CREATED" || status === "WAITING_PAYMENT") {
    return { label: "Menunggu bayar", tone: "orange" };
  }
  if (status === "PROVISIONING_FAILED") return { label: "Butuh bantuan", tone: "red" };
  return { label: "Sedang disiapkan", tone: "blue" };
}

function QuotaRing({ summary }: { summary: EsimHomeSummary }) {
  const progress =
    summary.remainingPercent === null ? null : Math.max(0, Math.min(100, summary.remainingPercent));
  if (progress === null) return null;
  const percentLabel = summary.quotaCaption?.includes("<1%") ? "<1%" : `${progress}%`;
  const low = summary.kind === "low";

  return (
    <div
      className="relative grid size-14 shrink-0 place-items-center"
      role="progressbar"
      aria-label="Sisa kuota eSIM"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={summary.quotaLabel ?? `${progress}%`}
      data-testid="esim-home-summary-progress"
    >
      <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(60,60,67,.14)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={low ? "#FF9F0A" : "#C62E3A"}
          strokeWidth="4"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${progress} 100`}
        />
      </svg>
      <span className="text-[10.5px] font-bold text-[#172b4d]">{percentLabel}</span>
    </div>
  );
}

function Tile({ tone, children }: { tone: "blue" | "orange" | "red"; children: ReactNode }) {
  const tones = {
    blue: "bg-[#E9F2FF] text-[#0A84FF]",
    orange: "bg-[#FFF4E5] text-[#FF9F0A]",
    red: "bg-brand-red-soft text-brand-red",
  } as const;
  return (
    <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${tones[tone]}`}>
      {children}
    </span>
  );
}

function FloatingEsimArtwork() {
  const reduceMotion = useReducedMotion();

  return (
    <span className="relative grid size-14 shrink-0 place-items-center" aria-hidden="true">
      <span className="absolute inset-1 rounded-full border border-border/60 bg-surface/70" />
      <motion.img
        src="/assets/esim/esim-chip-color-v1.png"
        alt=""
        width={256}
        height={228}
        loading="eager"
        decoding="async"
        draggable={false}
        initial={false}
        animate={
          reduceMotion ? { y: 0, rotate: 0 } : { y: [0, -4, 0], rotate: [0, 1.2, 0, -1.2, 0] }
        }
        transition={
          reduceMotion ? { duration: 0 } : { duration: 4.6, ease: "easeInOut", repeat: Infinity }
        }
        className="relative z-10 size-[54px] object-contain drop-shadow-[0_3px_5px_rgba(0,0,0,0.14)]"
      />
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
export function EsimHomeSummaryCard({
  orders,
  onSearchPackages,
}: {
  orders: Order[] | null;
  onSearchPackages: () => void;
}) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  if (orders === null) {
    return (
      <section
        data-testid="esim-home-summary-loading"
        aria-busy="true"
        aria-label="Menyiapkan eSIM kamu"
        className="overflow-hidden rounded-[24px] border border-border/60 bg-surface p-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-7 shrink-0 animate-pulse items-center justify-center rounded-[9px] bg-secondary motion-reduce:animate-none">
            <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <div className="h-4 w-28 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />
        </div>
        <div className="mt-3 h-20 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none" />
      </section>
    );
  }

  const now = Date.now();
  const ordered = sortEsimHomeOrders(
    orders.filter((order) => {
      const status = effectiveOrderStatus(order.status, order.expiresAt, now);
      return status !== "EXPIRED" && status !== "CANCELLED" && status !== "REFUNDED";
    }),
    now,
  );
  const prioritySummary = buildEsimHomeSummary(orders, now);
  const selectedOrder =
    selectedOrderId && ordered.some((order) => order.id === selectedOrderId)
      ? orders.find((order) => order.id === selectedOrderId)
      : undefined;
  const summary = selectedOrder ? buildEsimHomeSummary([selectedOrder], now) : prioritySummary;
  const priorityTarget = prioritySummary.target;
  const displayedOrder =
    selectedOrder ??
    (priorityTarget.kind === "detail" || priorityTarget.kind === "order"
      ? orders.find((order) => order.id === priorityTarget.id)
      : ordered[0]);

  if (summary.kind === "empty") {
    return (
      <article data-testid="esim-home-summary" data-state="empty" className={SUMMARY_CARD_CLASS}>
        <div className="flex min-h-[58px] items-center justify-between gap-2 px-4 pt-1">
          <h2 className="min-w-0 text-[13px] font-bold tracking-[-0.01em] text-foreground">
            eSIM perjalanan
          </h2>
          <FloatingEsimArtwork />
        </div>
        <div className="px-4 pt-1">
          <p className="text-[15px] font-bold tracking-[-0.015em] text-foreground">
            Belum punya eSIM?
          </p>
          <p className="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground">
            Internet siap sebelum berangkat. Pilih paket sesuai destinasi dan kuota.
          </p>
        </div>
        <div className="mt-3 border-t border-[rgba(60,60,67,0.12)]">
          <button
            type="button"
            onClick={onSearchPackages}
            aria-haspopup="dialog"
            className={`${ROW_CLASS} font-semibold text-foreground`}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-surface text-muted-foreground">
              <Search className="size-[15px]" aria-hidden="true" />
            </span>
            <RowShell>
              Cari paket eSIM
              <span className="mt-0.5 block text-[10.5px] font-normal text-muted-foreground">
                Jepang, Korea, 5 GB…
              </span>
            </RowShell>
          </button>
          <SummaryLink
            target={{ kind: "finder" }}
            ariaLabel="Semua paket eSIM"
            className={`${ROW_CLASS} border-t border-[rgba(60,60,67,0.12)] font-semibold text-foreground`}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-surface text-muted-foreground">
              <Globe2 className="size-[15px]" aria-hidden="true" />
            </span>
            <RowShell>
              Semua paket
              <span className="mt-0.5 block text-[10.5px] font-normal text-muted-foreground">
                Bandingkan kuota dan harga
              </span>
            </RowShell>
          </SummaryLink>
        </div>
      </article>
    );
  }

  const badge = statusBadge(summary, displayedOrder);
  const activeOrderId = displayedOrder?.id ?? "";
  const secondaryAction =
    summary.secondaryAction &&
    !(orders.length > 1 && summary.secondaryAction.target.kind === "list")
      ? summary.secondaryAction
      : undefined;

  const pageLabel = (order: Order) => {
    const parts = [esimHomeOrderLocation(order)];
    if (order.unlimited) parts.push("Unlimited");
    else if (order.volumeBytes && order.volumeBytes > 0) parts.push(formatGb(order.volumeBytes));
    return parts.join(" ");
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
    const target = ordered[next];
    if (!target) return;
    setSelectedOrderId(target.id);
    const buttons = event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
    buttons[next]?.focus();
  };

  return (
    <article
      data-testid="esim-home-summary"
      data-state={summary.kind}
      className={SUMMARY_CARD_CLASS}
    >
      <div className="flex min-h-[58px] items-center justify-between gap-2 px-4 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-[13px] font-bold tracking-[-0.01em] text-foreground">eSIM kamu</h2>
          <Badge label={badge.label} tone={badge.tone} />
        </div>
        <FloatingEsimArtwork />
      </div>

      <div className="px-4 pb-3.5 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[16.5px] font-bold leading-[1.25] tracking-[-0.022em] text-foreground">
              {summary.kind === "active" || summary.kind === "low" || summary.kind === "ready" ? (
                <>
                  <span aria-hidden="true">{summary.flag}</span> {summary.location ?? summary.title}
                </>
              ) : (
                summary.title
              )}
            </p>
            <p className="mt-1 text-[11.5px] leading-4 text-muted-foreground">
              {metaLine(summary, displayedOrder)}
            </p>
          </div>

          {summary.kind === "ready" && (
            <Tile tone="blue">
              <QrCode className="size-6" aria-hidden="true" />
            </Tile>
          )}
          {summary.kind === "pending" && (
            <Tile tone={displayedOrder?.status === "PROVISIONING_FAILED" ? "red" : "orange"}>
              <Clock3 className="size-6" aria-hidden="true" />
            </Tile>
          )}
          {(summary.kind === "active" || summary.kind === "low") && <QuotaRing summary={summary} />}
        </div>

        {(summary.kind === "active" || summary.kind === "low") && (
          <>
            {summary.quotaValue ? (
              <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                <span className="text-[15px] font-bold tracking-[-0.01em] text-foreground">
                  {summary.quotaValue}
                </span>{" "}
                {summary.quotaCaption}
              </p>
            ) : (
              <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                {summary.quotaLabel}
              </p>
            )}
            {summary.measuredAt !== undefined && (
              <p className="mt-1 text-[10.5px] text-muted-foreground/80">
                Data penyedia · diperbarui {snapshotAgeLabel(summary.measuredAt)}
              </p>
            )}
          </>
        )}

        {summary.kind === "ready" && (
          <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
            Pindai QR atau salin detail eSIM sebelum berangkat.
          </p>
        )}

        {summary.kind === "pending" && (
          <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
            {displayedOrder?.status === "ORDER_CREATED" ||
            displayedOrder?.status === "WAITING_PAYMENT"
              ? "Selesaikan pembayaran sebelum pesanan dibatalkan."
              : summary.eyebrow === "Butuh bantuan"
                ? "Hubungi dukungan agar eSIM bisa disiapkan ulang."
                : "Kami sedang menyiapkan eSIM-mu. Cek status secara berkala."}
          </p>
        )}

        {summary.kind === "history" && (
          <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
            Masa aktif paket ini sudah berakhir. Beli paket lagi untuk terhubung kembali.
          </p>
        )}
      </div>

      <div className="border-t border-[rgba(60,60,67,0.12)]">
        <ActionRow action={summary.primaryAction} emphasis />
        {secondaryAction && (
          <div className="border-t border-[rgba(60,60,67,0.12)]">
            <ActionRow action={secondaryAction} />
          </div>
        )}
        {orders.length > 1 && (
          <div className="border-t border-[rgba(60,60,67,0.12)]">
            <SummaryLink
              target={{ kind: "list" }}
              ariaLabel="Lihat semua eSIM"
              className={`${ROW_CLASS} font-semibold text-foreground`}
            >
              <RowShell>Lihat semua eSIM</RowShell>
            </SummaryLink>
          </div>
        )}
      </div>

      {ordered.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Pilih eSIM"
          onKeyDown={handlePagerKeys}
          className="flex items-center justify-center gap-1 border-t border-[rgba(60,60,67,0.12)] py-1.5"
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
                onClick={() => setSelectedOrderId(order.id)}
                className="tap grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full transition-colors ${checked ? "bg-brand-red" : "bg-[#C7C7CC]"}`}
                />
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
