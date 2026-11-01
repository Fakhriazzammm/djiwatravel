import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getHomeQuickPackages } from "@/lib/home-quick-packages.fn";
import type { QuickPackagePick, QuickPackageTag } from "@/lib/home-quick-packages";
import { packageDataLabel } from "@/lib/package-copy";
import { pricePerDay } from "@/lib/package-picker";

const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

const TAG: Record<QuickPackageTag, { label: string; className: string }> = {
  best_seller: { label: "🔥 Terlaris", className: "bg-[#FFF1D6] text-[#A86400]" },
  best_deal: { label: "💰 Best Deal", className: "bg-[#E3F6EA] text-[#1B7A3D]" },
};

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; code: string; picks: QuickPackagePick[]; stockPending: boolean };

/**
 * The two packages offered right under the destination chips: Terlaris and Best Deal, chosen by
 * the server (Admin pins first, then sales and price per day). Selecting one and tapping "Beli"
 * opens the checkout sheet; the full catalogue stays on the destination page.
 */
export function EsimQuickBuyPanel({
  destination,
  onBuy,
}: {
  destination: { code: string; nameId: string };
  onBuy: (packageCode: string) => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const code = destination.code;

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    setSelected(null);
    getHomeQuickPackages({ data: code }).then(
      (data) => {
        if (!live) return;
        if (!data) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ready", code, picks: data.picks, stockPending: data.stockPending });
        setSelected(data.picks[0]?.pkg.packageCode ?? null);
      },
      () => {
        if (live) setState({ kind: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [code, attempt]);

  const chosen =
    state.kind === "ready" ? state.picks.find((pick) => pick.pkg.packageCode === selected) : null;

  return (
    <div
      data-testid="esim-quick-buy-panel"
      role="region"
      aria-label={`Paket eSIM ${destination.nameId}`}
      className="mt-3 border-t border-border/60 pt-3"
    >
      {state.kind === "loading" && (
        <div aria-busy="true" aria-label="Memuat paket" className="flex gap-2.5">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-[118px] flex-1 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none"
            />
          ))}
        </div>
      )}

      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-2xl bg-secondary p-3 text-[13px] text-muted-foreground"
        >
          <p>Paket belum dapat dimuat. Tidak ada pesanan yang dibuat.</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="tap mt-2 min-h-11 rounded-xl bg-brand-red px-4 font-semibold text-white"
          >
            Coba lagi
          </button>
        </div>
      )}

      {state.kind === "ready" && state.picks.length === 0 && (
        <div className="rounded-2xl bg-secondary p-3 text-[13px] text-muted-foreground">
          <p>
            {state.stockPending
              ? "Stok sedang diperiksa. Coba lagi sebentar."
              : "Belum ada paket yang bisa dibeli untuk destinasi ini."}
          </p>
          <Link
            to="/destination/$code"
            params={{ code: state.code.toLowerCase() }}
            search={{ availability: "all" }}
            className="tap mt-1 flex min-h-11 items-center font-semibold text-brand-red"
          >
            Lihat halaman destinasi
          </Link>
        </div>
      )}

      {state.kind === "ready" && state.picks.length > 0 && (
        <>
          <div role="radiogroup" aria-label="Pilih paket" className="flex gap-2.5">
            {state.picks.map((pick) => {
              const checked = pick.pkg.packageCode === selected;
              const tag = TAG[pick.tag];
              return (
                <button
                  key={pick.pkg.packageCode}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setSelected(pick.pkg.packageCode)}
                  className={`tap min-w-0 flex-1 rounded-2xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    checked
                      ? "border-brand-red bg-brand-red-soft/40"
                      : "border-border/60 bg-secondary/60"
                  }`}
                >
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${tag.className}`}
                  >
                    {tag.label}
                  </span>
                  <span className="mt-2 block text-[20px] font-extrabold leading-tight tracking-[-0.02em]">
                    {packageDataLabel(pick.pkg).replace(/ data$/, "")}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    {pick.pkg.durationDays} hari
                  </span>
                  <span className="mt-1.5 block text-[12px] text-muted-foreground">
                    {rupiah(Math.round(pricePerDay(pick.pkg)))}/hari
                  </span>
                  <span className="block text-[15px] font-extrabold tabular-nums">
                    {rupiah(pick.pkg.priceIdr)}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!chosen}
            aria-haspopup="dialog"
            onClick={() => chosen && onBuy(chosen.pkg.packageCode)}
            className="tap mt-3 flex min-h-12 w-full items-center justify-between rounded-2xl bg-brand-red px-5 text-[15px] font-bold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span>Beli sekarang</span>
            <span className="tabular-nums">{chosen ? rupiah(chosen.pkg.priceIdr) : ""}</span>
          </button>
        </>
      )}
    </div>
  );
}
