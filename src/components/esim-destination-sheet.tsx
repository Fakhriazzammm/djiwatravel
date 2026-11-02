import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EsimPackagePicker } from "@/components/esim-package-picker";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getDestinationPackages } from "@/lib/destination-packages.fn";

export type SheetDestination = { code: string; flag: string; nameId: string };

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; data: NonNullable<Awaited<ReturnType<typeof getDestinationPackages>>> };

/** Bottom sheet that lists one destination's packages (same reader as `/destination/$code`). */
export function EsimDestinationSheet({
  destination,
  onClose,
}: {
  destination: SheetDestination | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const code = destination?.code;

  useEffect(() => {
    if (!code) return;
    let live = true;
    setState({ kind: "loading" });
    getDestinationPackages({ data: code }).then(
      (data) => {
        if (!live) return;
        setState(data ? { kind: "ready", data } : { kind: "error" });
      },
      () => {
        if (live) setState({ kind: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [code, attempt]);

  return (
    <Sheet open={destination !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border-border/70 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-6"
      >
        <SheetHeader className="shrink-0 mb-4 pr-10 text-left">
          <SheetTitle>
            <span aria-hidden="true">{destination?.flag}</span> Paket eSIM {destination?.nameId}
          </SheetTitle>
          <SheetDescription>Aktif otomatis saat tiba · tanpa ganti SIM.</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
        {state.kind === "loading" && (
          <div aria-busy="true" aria-label="Memuat paket" className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-14 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none"
              />
            ))}
          </div>
        )}
        {state.kind === "error" && (
          <div role="alert" className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
            <p>Paket belum dapat dimuat. Tidak ada pesanan yang dibuat.</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="tap mt-3 min-h-11 rounded-xl bg-brand-red px-4 font-semibold text-white"
            >
              Coba lagi
            </button>
          </div>
        )}
        {state.kind === "ready" &&
          (state.data.packages.length === 0 ? (
            <p className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
              Belum ada paket live untuk destinasi ini.
            </p>
          ) : (
            <>
              {state.data.stale && (
                <p className="mb-3 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
                  Menampilkan katalog tersimpan; harga mungkin belum terbaru.
                </p>
              )}
              <EsimPackagePicker
                packages={state.data.packages}
                stockPending={state.data.stockPending}
                onNavigate={onClose}
                footer={
                  <Link
                    to="/destination/$code"
                    params={{ code: state.data.destination.code.toLowerCase() }}
                    search={{ availability: "all" }}
                    onClick={onClose}
                    className="tap mt-1 flex min-h-11 items-center justify-center text-[13px] font-semibold text-muted-foreground"
                  >
                    Lihat semua paket &amp; bandingkan
                  </Link>
                }
              />
            </>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
