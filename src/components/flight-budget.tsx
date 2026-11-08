import { useState } from "react";
import { Wallet } from "lucide-react";
import { searchFlightIdeas } from "@/lib/flights.fn";
import { trackClick } from "@/lib/analytics";
import {
  BUDGET_PICK_TARGET,
  compactFlightPrice,
  durationLabel,
  parseBudget,
  transfersLabel,
  type FlightIdea,
  type FlightPlace,
} from "@/lib/flights";

const MESSAGE = {
  empty: "Belum ada tiket di bawah budget itu dari kota ini. Coba naikkan budget.",
  unavailable: "Pencarian sesuai budget sedang tidak tersedia.",
  login_required: "Masuk dulu untuk mencari sesuai budget.",
  rate_limited: "Terlalu banyak pencarian. Coba lagi nanti.",
  invalid: "Isi budget antara Rp 300 ribu dan Rp 50 juta.",
  failed: "Pencarian gagal. Coba lagi sebentar lagi.",
} as const;

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/**
 * "Cari sesuai budget": from the chosen origin, the places a traveler can fly to under a price.
 * Picking one fills the form and runs the normal search. Prices are recorded fares, not real time.
 */
export function FlightBudget({
  origin,
  onPick,
}: {
  origin: FlightPlace | null;
  onPick: (place: FlightPlace, date: string) => void;
}) {
  const [budget, setBudget] = useState("");
  const [ideas, setIdeas] = useState<FlightIdea[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function find() {
    if (!origin) {
      setNote("Pilih kota asal di atas dulu.");
      return;
    }
    const amount = parseBudget(budget);
    if (amount === null) {
      setNote(MESSAGE.invalid);
      return;
    }
    setLoading(true);
    setNote(null);
    try {
      const result = await searchFlightIdeas({ data: { origin: origin.code, budget: amount } });
      setIdeas(result.status === "ok" ? result.ideas : []);
      setNote(result.status === "ok" ? null : MESSAGE[result.status]);
    } catch {
      setIdeas([]);
      setNote(MESSAGE.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="mt-2.5 space-y-2 rounded-2xl bg-surface p-3 ring-1 ring-border/40"
      aria-label="Cari sesuai budget"
      data-testid="flight-budget"
    >
      <div className="flex items-center gap-2">
        <Wallet className="size-4 text-brand-red" aria-hidden="true" />
        <h2 className="text-[14px] font-semibold">Cari sesuai budget</h2>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Mau ke mana dengan budget sekian dari {origin ? origin.name : "kota asal"}? Harga tercatat,
        bisa berubah.
      </p>
      <div className="flex gap-2">
        <input
          inputMode="numeric"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          placeholder="Contoh: 1500000"
          aria-label="Budget maksimal (Rupiah)"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-border/70 bg-secondary/70 px-3 text-[14px] outline-none focus:border-brand-red"
        />
        <button
          type="button"
          onClick={() => void find()}
          disabled={loading}
          className="min-h-11 rounded-xl bg-secondary px-4 text-[13px] font-semibold disabled:opacity-40"
        >
          {loading ? "Mencari…" : "Cari"}
        </button>
      </div>
      {note && (
        <p role="status" className="px-1 text-[12px] font-medium text-muted-foreground">
          {note}
        </p>
      )}
      {ideas && ideas.length > 0 && (
        <ul className="space-y-1.5">
          {ideas.map((idea) => (
            <li key={idea.destination.code}>
              <button
                type="button"
                onClick={() => {
                  trackClick("/tiket", BUDGET_PICK_TARGET);
                  onPick(idea.destination, idea.departureDate);
                }}
                className="tap flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">
                    {idea.destination.name}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {dayLabel(idea.departureDate)} · {transfersLabel(idea.transfers)}
                    {idea.durationMinutes ? ` · ${durationLabel(idea.durationMinutes)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[14px] font-bold text-brand-red">
                  {compactFlightPrice(idea.priceIdr)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
