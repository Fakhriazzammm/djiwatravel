import { Delete, LoaderCircle, Wallet, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { beginDjiwaPayTopup } from "@/lib/djiwa-pay-topup-client";
import { nextFrame, paymentProgressLabel, type PaymentProgressStage } from "@/lib/payment-progress";
import { rupiah } from "@/lib/pricing";
import { FixedLayer } from "@/components/motion-primitives";

const PRESETS = [50_000, 100_000, 500_000, 1_000_000] as const;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "delete"] as const;
const MINIMUM_AMOUNT = 1_000;
export const TOPUP_PENDING_KEY = "djiwa-travel-topup-pending";

function amountAfterKey(value: string, key: string) {
  if (key === "delete") return value.length > 1 ? value.slice(0, -1) : "0";
  return (value === "0" ? key : `${value}${key}`).replace(/^0+(?=\d)/, "").slice(0, 8);
}

export function DjiwaPayTopup({
  userId,
  open,
  onOpenChange,
  creditedBefore,
  onSubmitted,
  presets = PRESETS,
  minimum = MINIMUM_AMOUNT,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditedBefore: number;
  onSubmitted?: (pending: { amount: number; startedAt: number; creditedBefore: number }) => void;
  /** Nominal cepat, disediakan server agar operasional bisa mengubah tanpa deploy. */
  presets?: readonly number[];
  minimum?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<PaymentProgressStage>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    const parsed = Number(amount);
    if (!Number.isSafeInteger(parsed) || parsed < minimum) {
      setError(`Minimal isi saldo ${rupiah(minimum)}.`);
      return;
    }
    setError(null);
    setBusy(true);
    setStage("preparing");
    try {
      const invoice = await beginDjiwaPayTopup(parsed, userId);
      const pending = { amount: parsed, startedAt: Date.now(), creditedBefore };
      window.sessionStorage.setItem(`${TOPUP_PENDING_KEY}:${userId}`, JSON.stringify(pending));
      onSubmitted?.(pending);
      setStage("redirecting");
      // Let the "opening" stage render before the browser leaves this page.
      await nextFrame();
      window.location.assign(invoice.invoice_url);
    } catch (cause) {
      setStage("idle");
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "Top up gagal. Coba lagi.");
    }
  }

  if (!open) return null;
  const close = () => { if (!busy) onOpenChange(false); };

  return (
    <FixedLayer>
      <>
      <motion.div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/35" initial={reduceMotion ? false : { opacity: 0 }} animate={reduceMotion ? undefined : { opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }} onClick={close} role="presentation">
        <motion.section role="dialog" aria-modal="true" aria-labelledby="djiwa-pay-topup-title" className="flex max-h-[94dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-[28px] bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_60px_rgba(15,23,42,0.2)]" initial={reduceMotion ? false : { y: "100%" }} animate={reduceMotion ? undefined : { y: 0 }} exit={reduceMotion ? undefined : { y: "100%" }} transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }} drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.45 }} onDragEnd={(_, info) => { if (info.offset.y > 120) close(); }} onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto h-1.5 w-11 rounded-full bg-muted" aria-hidden="true" />
          <div className="mt-3 flex items-center justify-between"><button type="button" onClick={close} disabled={busy} aria-label="Tutup Isi Saldo" className="tap flex h-11 w-11 items-center justify-center rounded-full bg-background shadow-sm disabled:opacity-50"><X className="size-5" /></button><h2 id="djiwa-pay-topup-title" className="text-base font-bold">Isi Saldo</h2><span className="w-11" aria-hidden="true" /></div>
          <div className="mt-3 divide-y divide-border rounded-2xl bg-background px-3"><div className="flex min-h-14 items-center justify-between"><div><p className="text-[10px] font-semibold text-muted-foreground">Dari</p><p className="text-sm font-semibold">Wallet Djiwa Travel</p></div><Wallet className="size-5 text-primary" aria-hidden="true" /></div><div className="flex min-h-14 items-center justify-between"><div><p className="text-[10px] font-semibold text-muted-foreground">Ke</p><p className="text-sm font-semibold">Wallet Djiwa Pay</p></div><Wallet className="size-5 text-primary" aria-hidden="true" /></div></div>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Nominal cepat</p><div className="mt-2 grid grid-cols-4 gap-1.5" aria-label="Preset nominal isi saldo">{presets.map((preset) => <button key={preset} type="button" aria-pressed={amount === String(preset)} disabled={busy} onClick={() => { setAmount(String(preset)); setError(null); }} className={`tap min-h-11 rounded-xl border px-1 text-[10px] font-bold disabled:opacity-60 ${amount === String(preset) ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"}`}>{rupiah(preset)}</button>)}</div>
          <div className="mt-4 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Nominal isi saldo</p><p className="mt-1 min-h-[48px] text-[34px] font-bold tracking-tight">{rupiah(Number(amount) || 0)}</p><p className="mt-1 text-[11px] text-muted-foreground">Minimal isi saldo Rp1.000</p></div>
          <div className="mx-auto mt-3 grid w-full max-w-[300px] grid-cols-3 gap-1.5" aria-label="Keypad nominal isi saldo">{KEYS.map((key, index) => key ? <button key={key} type="button" disabled={busy} aria-label={key === "delete" ? "Hapus satu angka" : `Angka ${key}`} onClick={() => { setAmount((value) => amountAfterKey(value, key)); setError(null); }} className="tap flex h-12 items-center justify-center rounded-2xl text-[22px] font-semibold disabled:opacity-50">{key === "delete" ? <Delete className="size-5" aria-hidden="true" /> : key}</button> : <span key={`empty-${index}`} aria-hidden="true" />)}</div>
          <div aria-live="polite" className="mt-2 min-h-5 text-center">{error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}</div><button type="button" disabled={busy || !Number.isSafeInteger(Number(amount)) || Number(amount) < minimum} onClick={() => void submit()} className="tap mt-2 min-h-12 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{busy ? paymentProgressLabel(stage) : "Lanjutkan"}</button>
        </motion.section>
      </motion.div>
      {stage !== "idle" && <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/60 px-5 backdrop-blur-sm"><section role="status" aria-live="polite" aria-labelledby="djiwa-pay-redirect-title" className="w-full max-w-sm rounded-[28px] bg-surface p-6 text-center shadow-xl"><LoaderCircle aria-hidden="true" className="mx-auto size-9 animate-spin text-primary motion-reduce:animate-none" /><h2 id="djiwa-pay-redirect-title" className="mt-4 text-xl font-bold">Tunggu sebentar</h2><p className="mt-2 text-sm">{stage === "redirecting" ? "Membuka halaman pembayaran" : "Menyiapkan pembayaran Djiwa Pay"}</p><p className="mt-3 text-xs text-muted-foreground">{stage === "redirecting" ? "Jangan tutup halaman ini." : "Mohon tunggu sebentar…"}</p></section></div>}
      </>
    </FixedLayer>
  );
}
