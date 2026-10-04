import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Copy } from "lucide-react";
import type { EsimProfile } from "@/lib/providers";
import { group } from "./shell";

export function EsimQr({ esim }: { esim: EsimProfile }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface p-6">
      <div className="rounded-xl bg-white p-3"><QRCodeSVG value={esim.lpa} size={200} /></div>
      <p className="mt-4 text-center text-sm text-muted-foreground">Scan QR ini untuk memasang eSIM</p>
    </div>
  );
}

function CopyRow({ k, v }: { k: string; v: string }) {
  return (
    <button onClick={() => navigator.clipboard?.writeText(v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <div className="flex-1 min-w-0"><p className="text-xs text-muted-foreground">{k}</p><p className="truncate font-mono text-sm">{v}</p></div>
      <Copy className="size-4 text-muted-foreground" />
    </button>
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
  iPhone: ["Buka Settings", "Pilih Cellular / Mobile Data", "Ketuk Add eSIM", "Pilih Use QR Code, lalu scan", "Aktifkan eSIM & beri label “Djiwa”", "Sampai di tujuan: nyalakan Data Roaming untuk eSIM ini"],
  Android: ["Buka Settings", "Pilih Connections / Network & Internet", "Ketuk SIM Manager → Add eSIM", "Scan QR code", "Aktifkan eSIM", "Sampai di tujuan: nyalakan Data Roaming untuk eSIM ini"],
};

export function InstallGuide() {
  const [os, setOs] = useState<keyof typeof guides>("iPhone");
  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
        {(Object.keys(guides) as (keyof typeof guides)[]).map((k) => (
          <button key={k} onClick={() => setOs(k)} className={`rounded-lg py-2 text-sm font-medium ${os === k ? "bg-surface shadow-sm" : "text-muted-foreground"}`}>{k}</button>
        ))}
      </div>
      <ol className="mt-4 space-y-3">
        {guides[os].map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">Pasang eSIM sebelum berangkat (butuh Wi-Fi). Data Roaming cukup dinyalakan saat sudah sampai.</p>
    </div>
  );
}
