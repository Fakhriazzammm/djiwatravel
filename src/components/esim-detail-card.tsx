import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { esimInstallLink, installPlatformFromUserAgent } from "@/lib/esim-install-link";
import type { EsimProfile } from "@/lib/providers";
import type { OrderStatus } from "@/lib/orders";
import type { ActivationTimeline } from "@/lib/travel-journey";
import { EsimStatusCard, statusPrimary, statusSecondary } from "@/components/esim-status-card";

export type DetailTab = "summary" | "usage" | "guide";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "summary", label: "Ringkasan" },
  { id: "usage", label: "Penggunaan" },
  { id: "guide", label: "Panduan" },
];

/**
 * Hero of the eSIM detail page and the ready order screen: the shared light status card with
 * the QR shown in place and the two install paths. Non-installable states pass their own
 * actions as children.
 */
export function EsimDetailCard({
  status,
  summary,
  headline,
  hint,
  esim,
  timeline,
  stat,
  onManual,
  children,
}: {
  status: OrderStatus;
  summary: string;
  headline: string;
  hint: string;
  esim: EsimProfile | null;
  timeline?: ActivationTimeline | undefined;
  stat?: { value: string; caption: string } | null | undefined;
  onManual: () => void;
  children?: ReactNode;
}) {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (!esim) return setLink(null);
    const platform = installPlatformFromUserAgent(navigator.userAgent);
    setLink(platform ? esimInstallLink(esim.lpa, platform) : null);
  }, [esim]);

  return (
    <EsimStatusCard
      testId="esim-detail-card"
      status={status}
      summary={summary}
      headline={headline}
      hint={hint}
      lpa={esim && !stat ? esim.lpa : null}
      stat={stat}
      timeline={timeline}
      hideStrip={status === "INSTALLED"}
      footnote={
        esim ? (
          <>
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            QR hanya untuk perangkatmu. Jangan dibagikan.
          </>
        ) : null
      }
    >
      {esim ? (
        <>
          {link ? (
            <a href={link} rel="noopener noreferrer" className={statusPrimary}>
              Pasang sekarang
            </a>
          ) : (
            <button type="button" onClick={onManual} className={statusPrimary}>
              Cara pasang
            </button>
          )}
          <button type="button" onClick={onManual} className={statusSecondary}>
            Pasang manual
          </button>
        </>
      ) : (
        children
      )}
    </EsimStatusCard>
  );
}

export function DetailSegments({
  value,
  onChange,
}: {
  value: DetailTab;
  onChange: (tab: DetailTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Detail eSIM"
      className="my-2.5 flex rounded-xl bg-secondary p-[2px]"
    >
      {DETAIL_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`tap min-h-9 flex-1 rounded-[10px] text-[13px] font-semibold ${
            value === t.id ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
