import { useState } from "react";
import { CheckCircle2, Info } from "lucide-react";

export function DeviceCompatibility() {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState({ unlocked: false, esim: false });
  return (
    <section className="mt-6 rounded-2xl bg-surface p-4" aria-labelledby="compatibility-title">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 size-5 shrink-0 text-brand-red" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="compatibility-title" className="font-semibold">
            Cek kesiapan perangkat
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pemeriksaan mandiri. Kami tidak menyimpan IMEI dan tidak menjamin semua model/provider.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="tap rounded-lg px-2 py-1 text-xs font-semibold text-brand-red"
        >
          {open ? "Tutup" : "Cek"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={checks.esim}
              onChange={(e) => setChecks({ ...checks, esim: e.target.checked })}
            />{" "}
            Perangkat saya mendukung eSIM.
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={checks.unlocked}
              onChange={(e) => setChecks({ ...checks, unlocked: e.target.checked })}
            />{" "}
            Perangkat saya tidak terkunci operator.
          </label>
          <p className="text-xs text-muted-foreground">
            Cek menu Settings &gt; Cellular/Mobile Data &gt; Add eSIM. Jika ragu, konfirmasi ke
            produsen/operator sebelum membeli.
          </p>
          {checks.esim && checks.unlocked && (
            <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="size-4" /> Checklist terpenuhi (advisory).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
