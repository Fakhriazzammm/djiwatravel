import { useState } from "react";
import { beginDjiwaPayTopup } from "@/lib/djiwa-pay-topup-client";
import { rupiah } from "@/lib/pricing";

export function DjiwaPayTopup({ userId }: { userId: string }) {
  const [amount, setAmount] = useState("10000");
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("idle");
    setInvoiceUrl(null);
    setError(null);
    const parsed = Number(amount.replace(/\D/g, ""));
    if (!Number.isSafeInteger(parsed) || parsed < 1000) {
      setError("Minimal top up Rp1.000.");
      return;
    }
    setState("pending");
    try {
      const invoice = await beginDjiwaPayTopup(parsed, userId);
      setInvoiceUrl(invoice.invoice_url);
      // Pending is intentional: only the canonical Mayar webhook credits saldo.
      setState("pending");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "Top up gagal. Coba lagi.");
    }
  }

  return (
    <section className="mt-6 rounded-2xl bg-surface p-4" aria-labelledby="djiwa-pay-topup-title">
      <h2 id="djiwa-pay-topup-title" className="font-semibold">Isi Saldo Djiwa Pay</h2>
      <p className="mt-1 text-sm text-muted-foreground">Pembayaran aman melalui Mayar. Saldo masuk setelah pembayaran terverifikasi.</p>
      <form className="mt-3 space-y-3" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-semibold" htmlFor="djiwa-pay-amount">Nominal (IDR)</label>
        <input
          id="djiwa-pay-amount"
          inputMode="numeric"
          min="1000"
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
          className="h-12 w-full rounded-xl bg-secondary px-4 outline-none focus:ring-2 focus:ring-ring"
          aria-describedby="djiwa-pay-topup-help"
        />
        <p id="djiwa-pay-topup-help" className="text-xs text-muted-foreground">Minimal Rp1.000 · {rupiah(Number(amount) || 0)}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {invoiceUrl && (
          <div className="rounded-xl bg-secondary p-3 text-sm">
            <p className="font-semibold">Invoice siap — status masih menunggu pembayaran.</p>
            <a className="mt-2 inline-flex font-semibold text-brand-red underline" href={invoiceUrl} target="_blank" rel="noreferrer">
              Buka invoice Mayar
            </a>
          </div>
        )}
        <button type="submit" disabled={state === "pending"} className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50">
          {state === "pending" ? (invoiceUrl ? "Invoice dibuat" : "Menyiapkan invoice…") : "Buat invoice top up"}
        </button>
      </form>
    </section>
  );
}
