import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckoutForm, type CheckoutFormData } from "@/components/checkout-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { loadCheckout } from "@/lib/checkout-load.fn";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: CheckoutFormData };

/**
 * Checkout as a bottom sheet over Home. It loads the package through the same server reader as
 * `/checkout/$id` and renders the same form, so price, sellability, member and wallet rules are
 * identical; only the container differs. The full page stays reachable by URL.
 */
export function EsimCheckoutSheet({
  packageCode,
  onClose,
}: {
  packageCode: string | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!packageCode) return;
    let live = true;
    setState({ kind: "loading" });
    loadCheckout({ data: packageCode }).then(
      (data) => {
        if (live) setState({ kind: "ready", data });
      },
      () => {
        if (live) setState({ kind: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [packageCode, attempt]);

  return (
    <Sheet open={packageCode !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        data-testid="esim-checkout-sheet"
        className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-border/70 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-6"
      >
        <SheetHeader className="mb-4 pr-10 text-left">
          <SheetTitle>Checkout</SheetTitle>
          <SheetDescription>Periksa paket, lalu pilih cara bayar.</SheetDescription>
        </SheetHeader>

        {state.kind === "loading" && (
          <div aria-busy="true" aria-label="Memuat checkout" className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-16 animate-pulse rounded-2xl bg-secondary motion-reduce:animate-none"
              />
            ))}
          </div>
        )}
        {state.kind === "error" && (
          <div role="alert" className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
            <p>Paket belum dapat dimuat. Tidak ada pesanan yang dibuat.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="tap min-h-11 rounded-xl bg-brand-red px-4 font-semibold text-white"
              >
                Coba lagi
              </button>
              <Link
                to="/esim/finder"
                onClick={onClose}
                className="tap flex min-h-11 items-center rounded-xl px-3 font-semibold text-foreground"
              >
                Pilih paket lain
              </Link>
            </div>
          </div>
        )}
        {state.kind === "ready" && <CheckoutForm {...state.data} variant="sheet" />}
      </SheetContent>
    </Sheet>
  );
}
