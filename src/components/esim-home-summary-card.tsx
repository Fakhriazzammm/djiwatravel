import { ChevronRight, Smartphone, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { buildEsimHomeSummary, type EsimHomeTarget } from "@/lib/esim-home-summary";
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
        className="overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 animate-pulse motion-reduce:animate-none items-center justify-center rounded-2xl bg-white/10">
            <Smartphone className="size-5 text-white/70" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse motion-reduce:animate-none rounded-full bg-white/20" />
            <div className="h-5 w-44 max-w-full animate-pulse motion-reduce:animate-none rounded-full bg-white/20" />
          </div>
        </div>
        <div className="mt-5 h-3 w-36 animate-pulse motion-reduce:animate-none rounded-full bg-white/15" />
        <div className="mt-4 h-11 animate-pulse motion-reduce:animate-none rounded-xl bg-white/10" />
      </section>
    );
  }

  const summary = buildEsimHomeSummary(orders);
  const progress =
    summary.remainingPercent === null ? null : Math.max(0, Math.min(100, summary.remainingPercent));

  return (
    <article
      data-testid="esim-home-summary"
      data-state={summary.kind}
      className="overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-sm"
    >
      <div className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <Wifi className="size-5" aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/65">
            {summary.eyebrow}
          </p>
          {summary.hasMultiple && (
            <SummaryLink
              target={{ kind: "list" }}
              className="tap inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-full px-2 text-[12px] font-semibold text-primary-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Lihat semua eSIM
              <ChevronRight className="size-4" aria-hidden="true" />
            </SummaryLink>
          )}
        </div>

        <SummaryLink
          target={summary.target}
          ariaLabel={`Buka eSIM: ${summary.title}`}
          className="tap mt-4 block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] font-bold leading-tight">{summary.title}</h2>
              <p className="mt-1 text-[13px] text-primary-foreground/70">{summary.subtitle}</p>
            </div>
            <ChevronRight
              className="mt-1 size-5 shrink-0 text-primary-foreground/65"
              aria-hidden="true"
            />
          </div>

          {summary.quotaLabel && (
            <p className="mt-4 text-[15px] font-semibold">{summary.quotaLabel}</p>
          )}
          {progress !== null && (
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"
              role="progressbar"
              aria-label="Sisa kuota eSIM"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-valuetext={summary.quotaLabel ?? `${progress}%`}
              data-testid="esim-home-summary-progress"
            >
              <div
                className={`h-full rounded-full ${summary.kind === "low" ? "bg-brand-red" : "bg-white"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </SummaryLink>

        <div className="mt-4 flex gap-2">
          <SummaryLink
            target={summary.primaryAction.target}
            className="tap flex min-h-11 flex-1 items-center justify-center rounded-xl bg-brand-red px-3 text-center text-[14px] font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {summary.primaryAction.label}
          </SummaryLink>
          {summary.secondaryAction && (
            <SummaryLink
              target={summary.secondaryAction.target}
              className="tap flex min-h-11 flex-1 items-center justify-center rounded-xl bg-white/10 px-3 text-center text-[14px] font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {summary.secondaryAction.label}
            </SummaryLink>
          )}
        </div>
      </div>
    </article>
  );
}
