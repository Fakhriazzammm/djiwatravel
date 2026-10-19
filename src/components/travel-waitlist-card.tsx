import { useState, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

type Props = { feature: "bagasi" | "shopper"; label: string; sub: string; icon: LucideIcon };

export function TravelWaitlistCard({ feature, label, sub, icon: Icon }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    destination: "",
    travelDate: "",
    email: "",
    whatsapp: "",
    consent: false,
  });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/travel-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, ...form }),
      });
      const body = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Pendaftaran belum berhasil");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pendaftaran belum berhasil");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap flex h-28 flex-col items-center justify-center rounded-2xl border-2 border-transparent bg-surface text-center text-muted-foreground"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
        <span className="mt-2 text-[14px] font-semibold text-foreground">{label}</span>
        <span className="text-[11px]">{sub}</span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-foreground/30 p-3 sm:items-center sm:justify-center"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${feature}-waitlist-title`}
            className="w-full max-w-lg rounded-3xl bg-background p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id={`${feature}-waitlist-title`} className="text-lg font-bold">
                {label} segera hadir
              </h2>
              <button
                type="button"
                aria-label="Tutup"
                onClick={() => setOpen(false)}
                className="tap rounded-full p-2"
              >
                <X className="size-5" />
              </button>
            </div>
            {done ? (
              <div className="mt-5 rounded-2xl bg-brand-red-soft p-4 text-sm">
                <p className="font-semibold">Terdaftar.</p>
                <p className="mt-1 text-muted-foreground">{`Kami akan memberi tahu saat ${label.toLowerCase()} tersedia.`}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-4 rounded-xl bg-brand-red px-4 py-3 text-sm font-semibold text-white"
                >
                  Selesai
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-3">
                <label className="block text-sm font-medium">
                  Destinasi
                  <input
                    required
                    value={form.destination}
                    onChange={(e) => setForm({ ...form, destination: e.target.value })}
                    placeholder="Contoh: Tokyo"
                    className="mt-1 h-11 w-full rounded-xl bg-surface px-3 outline-none"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Tanggal perjalanan (opsional)
                  <input
                    type="date"
                    value={form.travelDate}
                    onChange={(e) => setForm({ ...form, travelDate: e.target.value })}
                    className="mt-1 h-11 w-full rounded-xl bg-surface px-3 outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="mt-1 h-11 w-full rounded-xl bg-surface px-3 outline-none"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    WhatsApp
                    <input
                      value={form.whatsapp}
                      onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                      placeholder="08…"
                      className="mt-1 h-11 w-full rounded-xl bg-surface px-3 outline-none"
                    />
                  </label>
                </div>
                <label className="flex gap-2 text-xs text-muted-foreground">
                  <input
                    required
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                  />{" "}
                  Saya setuju dihubungi saat layanan tersedia.
                </label>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <button
                  disabled={busy}
                  className="w-full rounded-xl bg-brand-red px-4 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Menyimpan…" : "Daftar pemberitahuan"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
