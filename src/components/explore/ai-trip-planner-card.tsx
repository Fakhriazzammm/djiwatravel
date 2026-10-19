import { ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { destinations } from "@/lib/catalog";

export function AiTripPlannerCard() {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  return (
    <section className="rounded-3xl bg-primary p-4 text-primary-foreground shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-white/15">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Rencanakan perjalananmu</h2>
          <p className="mt-1 text-xs text-primary-foreground/75">
            Bingung mulai dari mana? Bantu susun perjalanan internasionalmu.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mt-4 flex min-h-10 w-full items-center justify-between rounded-xl bg-white px-3 text-sm font-semibold text-primary"
      >
        <span>{open ? "Tutup perencana" : "Mulai rencana sederhana"}</span>
        <ArrowRight className="size-4" />
      </button>
      {open && (
        <div className="mt-3 rounded-2xl bg-white/10 p-3">
          <label className="block text-xs font-semibold">Mau ke mana?</label>
          <select
            aria-label="Pilih destinasi perjalanan"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className="mt-2 h-10 w-full rounded-xl bg-white px-3 text-sm text-foreground"
          >
            <option value="">Pilih destinasi</option>
            {destinations
              .filter((item) => item.popular)
              .map((item) => (
                <option key={item.code} value={item.nameId}>
                  {item.nameId}
                </option>
              ))}
          </select>
          {destination && (
            <p className="mt-2 text-xs text-primary-foreground/80">
              Rencana awal untuk {destination} siap kamu lanjutkan dari layanan yang tersedia.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
