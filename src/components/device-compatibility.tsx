import { useState } from "react";
import { CheckCircle2, Info } from "lucide-react";

const deviceHelp = {
  iPhone:
    "Buka Pengaturan > Seluler > Tambah eSIM. Periksa juga Pengaturan > Umum > Mengenai > Kunci Operator; iPhone yang tidak terkunci menampilkan Tidak ada batasan SIM.",
  Samsung: "Buka Pengaturan > Koneksi > Manajer SIM > Tambah eSIM.",
  Pixel: "Buka Setelan > Jaringan & internet > SIM > Tambahkan SIM > Siapkan eSIM.",
} as const;

export function DeviceCompatibility() {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState({ unlocked: false, esim: false });
  const [device, setDevice] = useState<keyof typeof deviceHelp>("iPhone");
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
          aria-expanded={open}
          aria-controls="device-compatibility-details"
          className="tap rounded-lg px-2 py-1 text-xs font-semibold text-brand-red"
        >
          {open ? "Tutup" : "Cek"}
        </button>
      </div>
      {open && (
        <div
          id="device-compatibility-details"
          className="mt-3 space-y-3 border-t border-border pt-3 text-sm"
        >
          <p className="font-medium">Cara memeriksa perangkat</p>
          <div className="flex flex-wrap gap-2" aria-label="Jenis perangkat">
            {(Object.keys(deviceHelp) as (keyof typeof deviceHelp)[]).map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={device === name}
                onClick={() => setDevice(name)}
                className={`min-h-11 rounded-xl px-3 text-sm font-medium ${device === name ? "bg-brand-red text-white" : "bg-secondary"}`}
              >
                {name}
              </button>
            ))}
          </div>
          <p>{deviceHelp[device]}</p>
          <p className="text-xs text-muted-foreground">
            Nama menu dapat berbeda menurut model, wilayah, dan versi sistem. Adanya menu eSIM saja
            belum memastikan paket ini didukung. Jika ragu atau untuk perangkat lain, konfirmasi ke
            produsen dan operator sebelum membeli.
          </p>
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
          {checks.esim && checks.unlocked && (
            <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="size-4 shrink-0" /> Checklist mandiri terisi; kami belum
              memverifikasi kompatibilitas perangkatmu.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
