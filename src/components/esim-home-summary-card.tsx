import { ArrowRight, Globe2, Smartphone } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { buildEsimHomeSummary, type EsimHomeTarget } from "@/lib/esim-home-summary";
import { snapshotAgeLabel } from "@/lib/offline-travel-snapshot";
import type { Order } from "@/lib/orders";

function SummaryLink({
  target,
  children,
  className,
  ariaLabel,
}: {
  target: EsimHomeTarget;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const props = { className, "aria-label": ariaLabel };
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
        className="overflow-hidden rounded-2xl border border-border/60 bg-surface p-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 animate-pulse items-center justify-center rounded-xl bg-secondary motion-reduce:animate-none">
            <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <div className="h-4 w-28 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />
        </div>
        <div className="mt-3 h-20 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
      </section>
    );
  }

  const selectedOrder = orders.find((order) => order.id === selectedOrderId);
  const summary = buildEsimHomeSummary(selectedOrder ? [selectedOrder] : orders);
  const progress =
    summary.remainingPercent === null ? null : Math.max(0, Math.min(100, summary.remainingPercent));

  if (summary.kind === "empty") {
    return (
      <article
        data-testid="esim-home-summary"
        data-state="empty"
        className="rounded-2xl border border-border/70 bg-surface p-3.5 shadow-[0_8px_24px_-20px_rgba(23,43,77,0.35)]"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-bold text-[#172b4d]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-red-soft text-brand-red">
              <Smartphone className="size-4" aria-hidden="true" />
            </span>
            eSIM perjalanan
          </h2>
          <SummaryLink
            target={{ kind: "finder" }}
            className="tap inline-flex min-h-11 shrink-0 items-center gap-1 text-[12px] font-bold text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Semua paket <ArrowRight className="size-3.5" aria-hidden="true" />
          </SummaryLink>
        </div>
        <p className="mt-2 text-[14px] font-bold text-[#172b4d]">Belum punya eSIM?</p>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
          Cari paket sesuai destinasi dan kuota perjalananmu.
        </p>
        <button
          type="button"
          onClick={onSearchPackages}
          aria-haspopup="dialog"
          className="tap mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-red px-3 text-[12px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Cari paket eSIM
          <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
        </button>
      </article>
    );
  }

  const displayedOrderId =
    selectedOrder?.id ??
    (summary.target.kind === "detail" || summary.target.kind === "order" ? summary.target.id : "");
  const percentLabel = summary.quotaCaption?.includes("<1%") ? "<1%" : `${progress}%`;

  return (
    <article
      data-testid="esim-home-summary"
      data-state={summary.kind}
      className="rounded-2xl border border-border/70 bg-surface p-3.5 shadow-[0_8px_24px_-20px_rgba(23,43,77,0.35)]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-bold text-[#172b4d]">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-red-soft text-brand-red">
            <Globe2 className="size-4" aria-hidden="true" />
          </span>
          eSIM kamu
        </h2>
        {orders.length > 1 && (
          <SummaryLink
            target={{ kind: "list" }}
            className="tap inline-flex min-h-11 shrink-0 items-center text-[12px] font-bold text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Lihat semua eSIM
          </SummaryLink>
        )}
      </div>

      {orders.length > 1 && (
        <select
          aria-label="Pilih eSIM"
          value={displayedOrderId}
          onChange={(event) => setSelectedOrderId(event.target.value || null)}
          className="mt-1 min-h-11 w-full rounded-xl bg-secondary px-3 text-[12px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Pilih eSIM</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.packageName ?? order.packageId}
            </option>
          ))}
        </select>
      )}

      <div className="mt-2 rounded-xl bg-[#1f2a3d] p-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-[13px] font-semibold leading-5">{summary.title}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-white/65">{summary.subtitle}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${summary.kind === "low" || summary.eyebrow === "Butuh bantuan" ? "bg-brand-red/20 text-[#ffd6d2]" : "bg-white/10 text-white/90"}`}
          >
            {summary.eyebrow}
          </span>
        </div>

        {(summary.quotaValue || summary.quotaLabel) && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              {summary.quotaValue ? (
                <>
                  <p className="text-[10px] text-white/65">Sisa kuota</p>
                  <p className="mt-0.5 text-[22px] font-bold leading-none tracking-[-0.03em]">
                    {summary.quotaValue}
                  </p>
                  <p className="mt-1 text-[11px] text-white/70">{summary.quotaCaption}</p>
                </>
              ) : (
                <p className="text-[12px] leading-5 text-white/85">{summary.quotaLabel}</p>
              )}
            </div>
            {progress !== null && (
              <div
                className="relative flex size-14 shrink-0 items-center justify-center"
                role="progressbar"
                aria-label="Sisa kuota eSIM"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-valuetext={summary.quotaLabel ?? `${progress}%`}
                data-testid="esim-home-summary-progress"
              >
                <svg
                  className="absolute inset-0 size-full -rotate-90"
                  viewBox="0 0 40 40"
                  aria-hidden="true"
                >
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke="rgba(255,255,255,.18)"
                    strokeWidth="4"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke="#e83846"
                    strokeWidth="4"
                    strokeLinecap="round"
                    pathLength="100"
                    strokeDasharray={`${progress} 100`}
                  />
                </svg>
                <span className="text-[10px] font-bold">{percentLabel}</span>
              </div>
            )}
          </div>
        )}
        {summary.measuredAt !== undefined && (
          <p className="mt-2 text-[10px] text-white/60">
            Data penyedia · diperbarui {snapshotAgeLabel(summary.measuredAt)}
          </p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <SummaryLink
          target={summary.primaryAction.target}
          className="tap inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-red px-2 text-center text-[12px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {summary.primaryAction.label}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
        </SummaryLink>
        {summary.secondaryAction && (
          <SummaryLink
            target={summary.secondaryAction.target}
            className="tap inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl bg-secondary px-2 text-center text-[12px] font-semibold text-[#243957] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {summary.secondaryAction.label}
          </SummaryLink>
        )}
      </div>
    </article>
  );
}
