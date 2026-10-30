import { Link } from "@tanstack/react-router";
import { ArrowRight, Search, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { searchHomeEsimCatalog } from "@/lib/esim-home-catalog.fn";
import { packageDataLabel, packageDestinationLabel } from "@/lib/package-copy";
import type { ViewPackage } from "@/lib/package-view";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; packages: ViewPackage[]; stale: boolean; hasMore: boolean };

export function EsimHomeCatalogSearch() {
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [selected, setSelected] = useState<ViewPackage | null>(null);

  function updateQuery(value: string) {
    setQuery(value);
    setSelected(null);
    setState({ kind: "idle" });
  }

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;
    let current = true;
    const timer = window.setTimeout(() => {
      setState({ kind: "loading" });
      void searchHomeEsimCatalog({ data: value }).then(
        (result) => {
          if (current) setState({ kind: "ready", ...result });
        },
        () => {
          if (current) setState({ kind: "error" });
        },
      );
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query, attempt]);

  return (
    <article
      data-testid="esim-home-summary"
      data-state="empty"
      className="rounded-2xl border border-border/70 bg-surface p-3.5 shadow-[0_8px_24px_-20px_rgba(23,43,77,0.35)]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-bold text-[#172b4d]">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-red-soft text-brand-red">
            <Smartphone className="size-4" aria-hidden="true" />
          </span>
          eSIM perjalanan
        </h2>
        <Link
          to="/esim/finder"
          className="tap inline-flex min-h-11 shrink-0 items-center gap-1 text-[12px] font-bold text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Semua paket <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <label className="mt-2 flex min-h-11 items-center gap-2 rounded-xl bg-secondary/75 px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          maxLength={80}
          autoComplete="off"
          aria-label="Cari paket eSIM"
          placeholder="Cari negara, kuota, atau paket"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            onClick={() => updateQuery("")}
            aria-label="Hapus pencarian paket"
            className="tap flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </label>

      {!query && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="pr-1 text-[11px] text-muted-foreground">Populer:</span>
          {["Jepang", "Singapura", "Thailand"].map((country) => (
            <button
              key={country}
              type="button"
              onClick={() => updateQuery(country)}
              className="tap min-h-11 rounded-lg px-2 text-[12px] font-semibold text-[#385575] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {country}
            </button>
          ))}
        </div>
      )}

      {query.trim().length === 1 && (
        <p className="mt-2 text-[12px] text-muted-foreground">Ketik minimal 2 karakter.</p>
      )}
      {state.kind === "loading" && (
        <p role="status" className="mt-3 text-[12px] text-muted-foreground">
          Mencari paket…
        </p>
      )}
      {state.kind === "error" && (
        <div role="alert" className="mt-3 text-[12px] text-muted-foreground">
          <p>Daftar paket belum bisa dimuat.</p>
          <button
            type="button"
            onClick={() => {
              setState({ kind: "idle" });
              setAttempt((value) => value + 1);
            }}
            className="tap min-h-11 font-semibold text-brand-red"
          >
            Coba lagi
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <div className="mt-3" aria-live="polite">
          {state.packages.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Paket tidak ditemukan. Coba kata lain.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {state.packages.map((pkg) => (
                  <button
                    key={pkg.packageCode}
                    type="button"
                    aria-pressed={selected?.packageCode === pkg.packageCode}
                    onClick={() => setSelected(pkg)}
                    className={`tap min-h-16 min-w-0 rounded-xl border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.packageCode === pkg.packageCode ? "border-brand-red bg-brand-red-soft" : "border-border bg-surface"}`}
                  >
                    <span className="block truncate text-[12px] font-semibold text-[#172b4d]">
                      {packageDestinationLabel(pkg)} · {packageDataLabel(pkg)}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {pkg.durationDays} hari · Rp{pkg.priceIdr.toLocaleString("id-ID")}
                    </span>
                  </button>
                ))}
              </div>
              {selected && (
                <Link
                  to="/checkout/$id"
                  params={{ id: selected.packageCode }}
                  className="tap mt-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-red px-3 text-[12px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Lihat detail paket <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              )}
              {state.hasMore && (
                <Link
                  to="/esim/finder"
                  className="tap mt-1 inline-flex min-h-11 items-center text-[12px] font-semibold text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Lihat semua paket
                </Link>
              )}
              {state.stale && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Harga katalog tersimpan; harga diperiksa lagi saat checkout.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
