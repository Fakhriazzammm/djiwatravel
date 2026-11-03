import type { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { EsimStatusBadge } from "@/components/esim-status-badge";
import { orderStatusArt } from "@/lib/destination-art";
import type { OrderStatus } from "@/lib/orders";
import type { ActivationTimeline } from "@/lib/travel-journey";

const BAR_TONE = {
  done: "bg-brand-red",
  current: "bg-brand-red/50 motion-safe:animate-pulse",
  todo: "bg-secondary",
  failed: "bg-destructive",
} as const;

/** Four-segment progress strip, shared by every state so progress reads the same everywhere. */
export function StatusStrip({ timeline }: { timeline: ActivationTimeline }) {
  return (
    <ol className="mt-3 flex gap-1 text-center text-[10.5px] text-muted-foreground">
      {timeline.stages.map((stage) => (
        <li
          key={stage.id}
          className={`flex-1 ${stage.state === "current" || stage.state === "failed" ? "font-bold text-foreground" : ""}`}
          aria-current={stage.state === "current" ? "step" : undefined}
        >
          <span className={`mb-1 block h-1 rounded-full ${BAR_TONE[stage.state]}`} />
          {stage.label}
        </li>
      ))}
    </ol>
  );
}

/**
 * The one light status card used by the eSIM detail page and every order screen. A 3D
 * illustration (or, when installable, the QR) sits left of the package, status chip and one-line
 * hint; the four-stage strip and the actions follow. Meaning is always in text; the art is
 * decorative.
 */
export function EsimStatusCard({
  status,
  summary,
  headline,
  hint,
  lpa,
  timeline,
  hideStrip,
  stat,
  children,
  footnote,
  testId = "esim-status-card",
}: {
  status: OrderStatus;
  summary: string;
  headline: string;
  hint: string;
  /** When set, the QR replaces the illustration. */
  lpa?: string | null | undefined;
  timeline?: ActivationTimeline | undefined;
  hideStrip?: boolean | undefined;
  /** Replaces the illustration with a short figure, e.g. remaining quota. */
  stat?: { value: string; caption: string } | null | undefined;
  children?: ReactNode;
  footnote?: ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-3xl bg-surface p-3.5 shadow-sm" data-testid={testId}>
      <div className="flex items-center gap-3.5">
        <div className="grid size-[104px] shrink-0 place-items-center rounded-2xl bg-secondary/60 p-2">
          {lpa ? (
            <div className="rounded-lg bg-white p-1.5">
              <QRCodeSVG value={lpa} size={80} />
            </div>
          ) : stat ? (
            <div className="text-center">
              <p className="text-[26px] font-bold leading-none tracking-tight">{stat.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{stat.caption}</p>
            </div>
          ) : (
            <img
              src={orderStatusArt(status)}
              alt=""
              width={96}
              height={96}
              decoding="async"
              className="size-16 object-contain"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {summary}
          </p>
          <h1 className="mt-0.5 mb-1.5 text-[15px] font-bold leading-tight tracking-tight">
            {headline}
          </h1>
          <EsimStatusBadge status={status} />
        </div>
      </div>
      <p className="mt-2.5 text-[13px] leading-snug text-muted-foreground" aria-live="polite">
        {hint}
      </p>
      {timeline && !hideStrip && <StatusStrip timeline={timeline} />}
      {children && <div className="mt-3 flex gap-2">{children}</div>}
      {footnote && (
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-muted-foreground">
          {footnote}
        </p>
      )}
    </section>
  );
}

/** Shared action button styles so the card's primary/secondary pair is identical on every page. */
export const statusPrimary =
  "tap flex min-h-11 flex-1 items-center justify-center rounded-[13px] bg-brand-red px-3 text-[14.5px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
export const statusSecondary =
  "tap flex min-h-11 flex-1 items-center justify-center rounded-[13px] bg-secondary px-3 text-[14.5px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
