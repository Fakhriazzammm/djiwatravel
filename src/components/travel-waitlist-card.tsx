import { useState, type FormEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { FixedLayer } from "./motion-primitives";

type Props = {
  feature: "bagasi" | "shopper";
  label: string;
  sub: string;
  icon: LucideIcon;
  /** Custom trigger (e.g. an Explore-style service tile); defaults to the Home tile button. */
  trigger?: (open: () => void) => ReactNode;
};

export function TravelWaitlistCard({ feature, label, sub, icon: Icon, trigger }: Props) {
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
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap ios-card flex h-32 flex-col items-center justify-center text-center"
        >
          <span className="flex size-9 items-center justify-center rounded-[14px] bg-secondary text-muted-foreground">
            <Icon className="size-6" strokeWidth={1.8} />
          </span>
          <span className="mt-2.5 text-[15px] font-semibold text-foreground">{label}</span>
          <span className="text-[12px] text-muted-foreground">{sub}</span>
        </button>
      )}
      {open && (
        <FixedLayer>
          <div
            className="fixed inset-0 z-50 flex items-end bg-foreground/30 p-3 sm:items-center sm:justify-center"
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${feature}-waitlist-title`}
              className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl"
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
                <div className="mt-4 rounded-2xl bg-brand-red-soft p-4 text-sm">
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
        </FixedLayer>
      )}
    </>
  );
}
