import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { esimInstallLink, installPlatformFromUserAgent } from "@/lib/esim-install-link";
import type { EsimProfile } from "@/lib/providers";

export type DetailTab = "summary" | "usage" | "guide";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "summary", label: "Ringkasan" },
  { id: "usage", label: "Penggunaan" },
  { id: "guide", label: "Panduan" },
];

/**
 * Hero of the eSIM detail page: the profile as a card, with the QR shown in place and the two
 * install paths on it. Replaces the separate hero, "install now" panel and sticky bar, which all
 * asked for the same action.
 */
export function EsimDetailCard({
  summary,
  headline,
  hint,
  statusLabel,
  esim,
  muted,
  onManual,
}: {
  summary: string;
  headline: string;
  hint: string;
  statusLabel: string;
  esim: EsimProfile | null;
  muted: boolean;
  onManual: () => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (!esim) return setLink(null);
    const platform = installPlatformFromUserAgent(navigator.userAgent);
    setLink(platform ? esimInstallLink(esim.lpa, platform) : null);
  }, [esim]);

  const action =
    "tap flex min-h-12 flex-1 items-center justify-center rounded-2xl px-3 text-[14px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <section
      className={`rounded-3xl p-[18px] text-center text-white ${
        muted ? "bg-neutral-700" : "bg-gradient-to-br from-[#1c1c21] to-[#3a1518]"
      }`}
      data-testid="esim-detail-card"
    >
      <p className="text-[11.5px] font-medium uppercase tracking-wider opacity-65">{summary}</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight">{headline}</h1>
      <p className="mt-0.5 text-[13px] opacity-75">{hint}</p>

      {esim && (
        <div className="mx-auto mt-3.5 mb-3 grid size-32 place-items-center rounded-2xl bg-white p-2">
          <QRCodeSVG value={esim.lpa} size={112} />
        </div>
      )}

      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-semibold">
        <span className="size-[7px] rounded-full bg-warning" aria-hidden="true" />
        {statusLabel}
      </span>

      {esim && (
        <>
          <div className="mt-3.5 flex gap-2">
            {link ? (
              <a href={link} rel="noopener noreferrer" className={`${action} bg-brand-red`}>
                Pasang sekarang
              </a>
            ) : (
              <button type="button" onClick={onManual} className={`${action} bg-brand-red`}>
                Cara pasang
              </button>
            )}
            <button type="button" onClick={onManual} className={`${action} bg-white/10`}>
              Pasang manual
            </button>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] opacity-70">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            QR hanya untuk perangkatmu. Jangan dibagikan.
          </p>
        </>
      )}
    </section>
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
      className="my-3.5 flex rounded-2xl bg-secondary p-[3px]"
    >
      {DETAIL_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`tap min-h-10 flex-1 rounded-xl text-[13px] font-semibold ${
            value === t.id ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
