import { useState } from "react";
import { beginDjiwaPayTopup, resetDjiwaPayTopupIdempotency } from "@/lib/djiwa-pay-topup-client";
import { rupiah } from "@/lib/pricing";

const PRESETS = [50000, 100000, 250000] as const;
const MINIMUM_AMOUNT = 1000;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function DjiwaPayTopup({ userId }: { userId: string }) {
  const [amount, setAmount] = useState("10000");
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "pending") return;

    setError(null);
    const parsed = Number(amount);
    if (!Number.isSafeInteger(parsed) || parsed < MINIMUM_AMOUNT) {
      setError("Minimal isi saldo Rp1.000.");
      return;
    }

    setState("pending");
    try {
      const invoice = await beginDjiwaPayTopup(parsed, userId);
      setInvoiceUrl(invoice.invoice_url);
      // Pending is intentional: only the canonical webhook credits saldo.
      setState("pending");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "Top up gagal. Coba lagi.");
    }
  }

  function startNewInvoice() {
    resetDjiwaPayTopupIdempotency(userId);
    setInvoiceUrl(null);
    setError(null);
    setState("idle");
  }

  const hasAmount = amount.length > 0;
  const formattedAmount = hasAmount ? rupiah(Number(amount)) : "";
  const isCreating = state === "pending" && !invoiceUrl;

  return (
    <section
      id="djiwa-pay-topup"
      tabIndex={-1}
      className="mt-5 rounded-[22px] bg-surface p-4 shadow-sm sm:p-5"
      aria-labelledby="djiwa-pay-topup-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Djiwa Pay
          </p>
          <h2 id="djiwa-pay-topup-title" className="mt-1 text-lg font-semibold tracking-tight">
            Isi saldo
          </h2>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          IDR
        </span>
      </div>
      <p className="mt-2 text-sm leading-5 text-muted-foreground">
        Buat invoice pembayaran. Saldo masuk hanya setelah pembayaran terverifikasi.
      </p>

      <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={isCreating}>
          <legend className="text-sm font-semibold">Pilih nominal</legend>
          <div className="mt-2 grid grid-cols-3 gap-2" aria-label="Preset nominal isi saldo">
            {PRESETS.map((preset) => {
              const selected = amount === String(preset);
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setAmount(String(preset));
                    setError(null);
                  }}
                  className={`min-h-11 rounded-xl border px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:bg-secondary"
                  }`}
                >
                  {rupiah(preset)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label className="text-sm font-semibold" htmlFor="djiwa-pay-amount">
            Nominal lainnya
          </label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-muted-foreground">
              Rp
            </span>
            <input
              id="djiwa-pay-amount"
              inputMode="numeric"
              autoComplete="off"
              value={formattedAmount.replace(/^Rp/, "")}
              onChange={(event) => {
                setAmount(digitsOnly(event.target.value));
                setError(null);
              }}
              className="h-12 w-full rounded-xl border border-border bg-background pl-11 pr-4 text-base font-semibold outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              aria-describedby="djiwa-pay-topup-help djiwa-pay-topup-status"
              aria-label="Nominal isi saldo dalam rupiah"
              disabled={isCreating}
            />
          </div>
          <p id="djiwa-pay-topup-help" className="mt-1.5 text-xs text-muted-foreground">
            Minimal Rp1.000 · {hasAmount ? formattedAmount : "Masukkan nominal"}
          </p>
        </div>

        <div id="djiwa-pay-topup-status" aria-live="polite" aria-atomic="true" className="min-h-5">
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          {isCreating && (
            <p className="text-sm text-muted-foreground">
              Menyiapkan invoice… Jangan tutup halaman ini.
            </p>
          )}
          {invoiceUrl && (
            <div className="rounded-2xl bg-secondary p-3.5 text-sm">
              <p className="font-semibold">Invoice siap, pembayaran masih menunggu konfirmasi.</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Saldo belum bertambah dari pembuatan invoice. Selesaikan pembayaran melalui tautan
                berikut.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <a
                  className="inline-flex min-h-11 items-center font-semibold text-brand-red underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Buka invoice pembayaran
                </a>
                <button
                  type="button"
                  onClick={startNewInvoice}
                  className="inline-flex min-h-11 items-center font-semibold text-muted-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Buat invoice baru
                </button>
              </div>
            </div>
          )}
        </div>

        {!invoiceUrl && (
          <button
            type="submit"
            disabled={isCreating}
            className="min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? "Menyiapkan invoice…" : "Buat invoice top up"}
          </button>
        )}
      </form>
    </section>
  );
}
