import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { ShieldCheck, Smartphone } from "lucide-react";
import {
  esimInstallLink,
  installPlatformFromUserAgent,
  type InstallPlatform,
} from "@/lib/esim-install-link";
import { Copy, Eye, EyeOff } from "lucide-react";
import type { EsimProfile } from "@/lib/providers";
import { group } from "./shell";
import { maskSensitive } from "@/lib/sensitive-data";

export function EsimQr({ esim, compact = false }: { esim: EsimProfile; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl bg-surface ${compact ? "p-4" : "p-6"}`}>
      <div className="rounded-xl bg-white p-2">
        <QRCodeSVG value={esim.lpa} size={compact ? 168 : 200} />
      </div>
      <p className="mt-3 text-center text-[13px] text-muted-foreground">
        Scan QR ini untuk memasang eSIM
      </p>
    </div>
  );
}

/**
 * One install surface: QR, one-tap install on a phone, and the privacy note. Used by the order
 * confirmation and the eSIM detail so the two cannot drift apart.
 */
export function EsimInstallPanel({
  esim,
  compact = false,
  withGuide = false,
}: {
  esim: EsimProfile;
  compact?: boolean;
  withGuide?: boolean;
}) {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  useEffect(() => setPlatform(installPlatformFromUserAgent(navigator.userAgent)), []);
  const link = platform ? esimInstallLink(esim.lpa, platform) : null;
  return (
    <div className="space-y-4">
      {link && (
        <a
          href={link}
          rel="noopener noreferrer"
          className="tap flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-red px-4 text-[14px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Smartphone className="size-5" aria-hidden="true" /> Pasang langsung di perangkat ini
        </a>
      )}
      <EsimQr esim={esim} compact={compact} />
      {withGuide && <InstallGuide />}
      <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        QR dan kode aktivasi hanya untuk perangkatmu. Jangan bagikan ke orang lain.
      </p>
    </div>
  );
}

function CopyRow({ k, v }: { k: string; v: string }) {
  const [revealed, setRevealed] = useState(false);
  const display = revealed ? v : maskSensitive(v);
  return (
    <div className="flex w-full items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{k}</p>
        <p className="truncate font-mono text-sm">{display}</p>
      </div>
      <button
        type="button"
        aria-label={revealed ? `Sembunyikan ${k}` : `Tampilkan ${k}`}
        onClick={() => setRevealed((value) => !value)}
        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <button
        type="button"
        aria-label={`Salin ${k}`}
        onClick={() => navigator.clipboard?.writeText(v)}
        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}

export function ManualDetails({ esim, iccid }: { esim: EsimProfile; iccid?: boolean }) {
  return (
    <div className={group}>
      <CopyRow k="SM-DP+ Address" v={esim.smdp} />
      <CopyRow k="Activation Code" v={esim.activationCode} />
      {iccid && <CopyRow k="ICCID" v={esim.iccid} />}
    </div>
  );
}

const guides = {
  iPhone: [
    "Buka Settings",
    "Pilih Cellular / Mobile Data",
    "Ketuk Add eSIM",
    "Pilih Use QR Code, lalu scan",
    "Aktifkan eSIM & beri label “Djiwa”",
    "Sampai di tujuan: nyalakan Data Roaming untuk eSIM ini",
  ],
  Android: [
    "Buka Settings",
    "Pilih Connections / Network & Internet",
    "Ketuk SIM Manager → Add eSIM",
    "Scan QR code",
    "Aktifkan eSIM",
    "Sampai di tujuan: nyalakan Data Roaming untuk eSIM ini",
  ],
};

export function InstallGuide() {
  const [os, setOs] = useState<keyof typeof guides>("iPhone");
  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
        {(Object.keys(guides) as (keyof typeof guides)[]).map((k) => (
          <button
            key={k}
            onClick={() => setOs(k)}
            className={`rounded-lg py-2 text-sm font-medium ${os === k ? "bg-surface shadow-sm" : "text-muted-foreground"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <ol className="mt-4 space-y-3">
        {guides[os].map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">
        Pasang eSIM sebelum berangkat (butuh Wi-Fi). Data Roaming cukup dinyalakan saat sudah
        sampai.
      </p>
    </div>
  );
}
