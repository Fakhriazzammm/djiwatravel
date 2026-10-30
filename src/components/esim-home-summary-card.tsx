import { ArrowRight, ChevronRight, Globe2, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
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

export function EsimHomeSummaryCard({ orders }: { orders: Order[] | null }) {
  if (orders === null) {
    return (
      <section
        data-testid="esim-home-summary-loading"
        aria-busy="true"
        aria-label="Menyiapkan eSIM kamu"
        className="overflow-hidden rounded-3xl border border-border/60 bg-surface p-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 animate-pulse motion-reduce:animate-none items-center justify-center rounded-2xl bg-secondary">
            <Smartphone className="size-5 text-muted-foreground" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse motion-reduce:animate-none rounded-full bg-secondary" />
            <div className="h-5 w-44 max-w-full animate-pulse motion-reduce:animate-none rounded-full bg-secondary" />
          </div>
        </div>
        <div className="mt-5 h-3 w-36 animate-pulse motion-reduce:animate-none rounded-full bg-secondary" />
        <div className="mt-4 h-11 w-32 animate-pulse motion-reduce:animate-none rounded-xl bg-secondary" />
      </section>
    );
  }

  const summary = buildEsimHomeSummary(orders);
  const progress =
    summary.remainingPercent === null ? null : Math.max(0, Math.min(100, summary.remainingPercent));

  if (summary.kind === "empty") {
    return (
      <article
        data-testid="esim-home-summary"
        data-state="empty"
        className="relative overflow-hidden rounded-3xl border border-[#f4dedb] bg-gradient-to-br from-[#fffdfa] via-[#fff7f4] to-[#ffebe8] shadow-[0_8px_24px_-18px_rgba(109,42,36,0.35)]"
      >
        <div
          className="absolute -right-12 -top-16 size-44 rounded-full border border-white/80 bg-white/35"
          aria-hidden="true"
        />
        <div className="relative flex min-h-[170px] items-center gap-1 p-5">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-red">
              <span className="size-1.5 rounded-full bg-brand-red" aria-hidden="true" />
              eSIM internasional
            </p>
            <h2 className="mt-2 max-w-[14rem] text-[21px] font-bold leading-[1.15] tracking-[-0.025em] text-[#172b4d]">
              {summary.title}
            </h2>
            <p className="mt-1.5 max-w-[14rem] text-[12px] leading-[1.45] text-[#606978]">
              {summary.subtitle}
            </p>
            <SummaryLink
              target={summary.primaryAction.target}
              className="tap mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-red px-4 text-[13px] font-bold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {summary.primaryAction.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </SummaryLink>
          </div>
          <img
            src="/assets/esim/travel-pass-v1.png"
            alt=""
            width="320"
            height="266"
            className="relative w-[34%] max-w-[145px] shrink-0 object-contain"
            decoding="async"
          />
        </div>
      </article>
    );
  }

  return (
    <article
      data-testid="esim-home-summary"
      data-state={summary.kind}
      className="relative overflow-hidden rounded-3xl border border-[#e6eaf1] bg-surface shadow-[0_8px_24px_-20px_rgba(23,43,77,0.35)]"
    >
      <div
        className="h-1 bg-gradient-to-r from-brand-red via-[#f27c72] to-[#f8d8cf]"
        aria-hidden="true"
      />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#243957]">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#edf2f8] text-[#243957]">
              <Globe2 className="size-4" aria-hidden="true" />
            </span>
            eSIM kamu
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${summary.kind === "low" || summary.eyebrow === "Butuh bantuan" ? "bg-brand-red-soft text-brand-red" : summary.kind === "ready" || summary.kind === "active" ? "bg-[#edf4f1] text-[#287254]" : "bg-[#edf2f8] text-[#385575]"}`}
          >
            {summary.eyebrow}
          </span>
        </div>

        <div className="mt-3">
          <h2 className="text-[19px] font-bold leading-tight tracking-[-0.02em] text-[#172b4d]">
            {summary.title}
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{summary.subtitle}</p>
        </div>

        {summary.quotaValue ? (
          <div className="mt-4">
            <p className="text-[11px] font-medium text-muted-foreground">Sisa kuota</p>
            <p className="mt-0.5 text-[26px] font-bold leading-none tracking-[-0.035em] text-[#172b4d]">
              {summary.quotaValue}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">{summary.quotaCaption}</p>
          </div>
        ) : summary.quotaLabel ? (
          <p className="mt-3 text-[13px] font-medium text-[#344760]">{summary.quotaLabel}</p>
        ) : null}

        {progress !== null && (
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-[#e9edf3]"
            role="progressbar"
            aria-label="Sisa kuota eSIM"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={summary.quotaLabel ?? `${progress}%`}
            data-testid="esim-home-summary-progress"
          >
            <div
              className={`h-full rounded-full ${summary.kind === "low" ? "bg-brand-red" : "bg-[#264d7b]"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {summary.measuredAt !== undefined && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Data penyedia · diperbarui {snapshotAgeLabel(summary.measuredAt)}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-[#dfe5ee] pt-3">
          <SummaryLink
            target={summary.primaryAction.target}
            className="tap inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-red px-3 text-center text-[13px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {summary.primaryAction.label}
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
          </SummaryLink>
          {summary.secondaryAction && (
            <SummaryLink
              target={summary.secondaryAction.target}
              className="tap inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#f1f4f8] px-3 text-center text-[13px] font-semibold text-[#243957] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {summary.secondaryAction.label}
            </SummaryLink>
          )}
          {summary.hasMultiple && (
            <SummaryLink
              target={{ kind: "list" }}
              className="tap inline-flex min-h-11 w-full items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold text-[#385575] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Lihat semua eSIM <ChevronRight className="size-4" aria-hidden="true" />
            </SummaryLink>
          )}
        </div>
      </div>
    </article>
  );
}
