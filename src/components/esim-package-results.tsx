import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { searchHomeEsimCatalog } from "@/lib/esim-home-catalog.fn";
import { packageDataLabel, packageDestinationLabel } from "@/lib/package-copy";
import type { ViewPackage } from "@/lib/package-view";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; packages: ViewPackage[]; stale: boolean; hasMore: boolean };

/**
 * Package results for the single Home search dialog.
 *
 * The parent owns the query; this component only fetches once the query is
 * meaningful, debounces keystrokes, and renders the server-filtered catalog.
 */
export function EsimPackageResults({
  query,
  onNavigate,
}: {
  query: string;
  onNavigate?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ kind: "idle" });

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setState({ kind: "idle" });
      return;
    }
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

  if (query.trim().length < 2) return null;

  return (
    <section className="mt-4" aria-label="Paket eSIM">
      <p className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Paket eSIM
      </p>

      {state.kind === "loading" && (
        <p role="status" className="px-1 py-2 text-[12px] text-muted-foreground">
          Mencari paket…
        </p>
      )}

      {state.kind === "error" && (
        <div role="alert" className="px-1 py-2 text-[12px] text-muted-foreground">
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
        <div aria-live="polite">
          {state.packages.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-muted-foreground">
              Tidak ada paket eSIM yang cocok.
            </p>
          ) : (
            <>
              <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
                {state.packages.map((pkg) => (
                  <Link
                    key={pkg.packageCode}
                    to="/checkout/$id"
                    params={{ id: pkg.packageCode }}
                    onClick={onNavigate}
                    className="tap flex min-h-14 items-center gap-3 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[#172b4d]">
                        {packageDestinationLabel(pkg)} · {packageDataLabel(pkg)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {pkg.durationDays} hari · Rp{pkg.priceIdr.toLocaleString("id-ID")}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
              {state.hasMore && (
                <Link
                  to="/esim/finder"
                  onClick={onNavigate}
                  className="tap mt-1 inline-flex min-h-11 items-center gap-1 px-1 text-[12px] font-semibold text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Lihat semua paket <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              )}
              {state.stale && (
                <p className="mt-1 px-1 text-[11px] text-muted-foreground">
                  Harga katalog tersimpan; harga diperiksa lagi saat checkout.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
