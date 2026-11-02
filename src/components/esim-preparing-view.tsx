import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Lock, RefreshCw } from "lucide-react";
import { activationTimeline } from "@/lib/travel-journey";
import { snapshotAgeLabel } from "@/lib/offline-travel-snapshot";
import { REFRESH_COOLDOWN_MS } from "@/components/travel-timeline";
import { rupiah } from "@/lib/pricing";
import type { Order } from "@/lib/orders";

const METHOD_LABEL: Record<string, string> = {
  djiwa_pay: "Djiwa Pay",
  qris: "QRIS",
};

const BAR_TONE = {
  done: "bg-success",
  current: "bg-brand-red",
  todo: "bg-secondary",
  failed: "bg-brand-red",
} as const;

/** Four-segment progress strip shared by the waiting and ready order screens. */
export function StageStrip({ timeline }: { timeline: ReturnType<typeof activationTimeline> }) {
  return (
    <section className="rounded-[20px] bg-surface px-[18px] py-4">
      <ol className="flex gap-1.5 text-center text-[11.5px] text-muted-foreground">
        {timeline.stages.map((stage) => (
          <li
            key={stage.id}
            className={`flex-1 ${stage.state === "current" ? "font-semibold text-foreground" : ""}`}
            aria-current={stage.state === "current" ? "step" : undefined}
          >
            <span className={`mb-1.5 block h-[5px] rounded-full ${BAR_TONE[stage.state]}`} />
            {stage.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Waiting screen shown between payment and a ready eSIM: a locked preview of the card the
 * customer is about to receive, one four-stage progress strip, and a prep checklist.
 * The order timeline above it is intentionally not rendered, so the status is stated once.
 */
export function EsimPreparingView({
  order,
  packageLine,
  lastSyncedAt,
  onRefresh,
  notifySupported,
  notifyReady,
  notifyBusy,
  onToggleNotify,
}: {
  order: Order;
  packageLine: string;
  lastSyncedAt: number | null;
  onRefresh: () => void | Promise<void>;
  notifySupported: boolean;
  notifyReady: boolean;
  notifyBusy: boolean;
  onToggleNotify: () => void;
}) {
  const timeline = activationTimeline(order.status);
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const cooling = cooldownUntil > Date.now();

  async function refresh() {
    if (busy || Date.now() < cooldownUntil) return;
    setBusy(true);
    setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
    try {
      await onRefresh();
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const checklist = [
    "Terhubung ke Wi-Fi / internet",
    "Pastikan HP mendukung eSIM & tidak terkunci operator",
  ];

  return (
    <div className="space-y-3" data-testid="esim-preparing">
      <section
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1c1c21] to-[#3a1518] p-5 text-center text-white"
        aria-live="polite"
      >
        <p className="text-[11.5px] font-medium uppercase tracking-wider opacity-65">
          {packageLine}
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight">Menyiapkan eSIM kamu…</h1>
        <p className="mt-0.5 text-[13px] opacity-75">
          Pembayaran diterima. Biasanya hanya beberapa menit.
        </p>
        <div className="relative mx-auto mt-4 mb-2.5 grid size-[120px] place-items-center overflow-hidden rounded-2xl bg-[repeating-linear-gradient(45deg,#ffffff22_0_6px,#ffffff10_6px_12px)]">
          <Lock className="size-6" aria-hidden="true" />
          <span
            className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span className="sr-only">QR code akan muncul setelah eSIM siap</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-semibold">
          <span className="size-[7px] rounded-full bg-warning" aria-hidden="true" />
          {order.status === "PAID" ? "Pembayaran diterima" : "Diproses penyedia"}
        </span>
      </section>

      <StageStrip timeline={timeline} />

      <section className="rounded-[20px] bg-surface px-[18px] py-4">
        <p className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Siapkan selama menunggu
        </p>
        <ul>
          {checklist.map((item) => (
            <li key={item} className="flex items-center gap-2.5 py-[7px] text-[13.5px]">
              <span
                className="size-[18px] shrink-0 rounded-md border-2 border-border"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
          {notifySupported && (
            <li className="flex items-center gap-2.5 py-[7px] text-[13.5px]">
              {notifyReady ? (
                <>
                  <span
                    className="grid size-[18px] shrink-0 place-items-center rounded-md bg-success text-[11px] text-primary-foreground"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span className="flex-1">Notifikasi aktif — kami kabari saat siap</span>
                </>
              ) : (
                <>
                  <span
                    className="size-[18px] shrink-0 rounded-md border-2 border-border"
                    aria-hidden="true"
                  />
                  <span className="flex-1">Aktifkan notifikasi</span>
                </>
              )}
              <button
                type="button"
                onClick={onToggleNotify}
                disabled={notifyBusy}
                className="tap flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-[12px] font-semibold disabled:opacity-50"
              >
                {notifyReady ? (
                  <BellRing className="size-3.5" aria-hidden="true" />
                ) : (
                  <Bell className="size-3.5" aria-hidden="true" />
                )}
                {notifyBusy ? "Mengaktifkan…" : notifyReady ? "Matikan" : "Aktifkan"}
              </button>
            </li>
          )}
        </ul>
      </section>

      <section className="rounded-[20px] bg-surface px-[18px] py-2">
        <div className="flex justify-between py-2 text-[13.5px]">
          <span className="text-muted-foreground">Total dibayar</span>
          <span>{rupiah(order.amount)}</span>
        </div>
        <div className="flex justify-between border-t border-border py-2 text-[13.5px]">
          <span className="text-muted-foreground">Metode</span>
          <span>{METHOD_LABEL[order.method] ?? String(order.method)}</span>
        </div>
      </section>

      <div className="flex items-center justify-center gap-2 pt-1 text-center text-xs text-muted-foreground">
        <span>
          Halaman memperbarui sendiri
          {typeof lastSyncedAt === "number" ? ` · ${snapshotAgeLabel(lastSyncedAt)}` : ""}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy || cooling}
          className="tap inline-flex min-h-9 items-center gap-1 font-semibold text-foreground underline disabled:opacity-50"
        >
          <RefreshCw className={busy ? "size-3 animate-spin" : "size-3"} aria-hidden="true" />
          {busy ? "Memeriksa…" : "Perbarui status"}
        </button>
      </div>
    </div>
  );
}
