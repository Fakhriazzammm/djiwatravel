import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, RefreshCw } from "lucide-react";
import { activationTimeline } from "@/lib/travel-journey";
import { snapshotAgeLabel } from "@/lib/offline-travel-snapshot";
import { REFRESH_COOLDOWN_MS } from "@/components/travel-timeline";
import { rupiah } from "@/lib/pricing";
import { EsimStatusCard, statusSecondary } from "@/components/esim-status-card";
import type { Order } from "@/lib/orders";

const METHOD_LABEL: Record<string, string> = {
  djiwa_pay: "Djiwa Pay",
  qris: "QRIS",
};

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
    <div className="space-y-2.5" data-testid="esim-preparing">
      <EsimStatusCard
        status={order.status}
        summary={packageLine}
        headline="Menyiapkan eSIM kamu…"
        hint="Pembayaran diterima. Biasanya hanya beberapa menit, halaman ini memperbarui sendiri."
        timeline={timeline}
      >
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy || cooling}
          className={`${statusSecondary} gap-1.5 disabled:opacity-50`}
        >
          <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden="true" />
          {busy ? "Memeriksa…" : "Perbarui status"}
        </button>
      </EsimStatusCard>

      <section className="rounded-3xl bg-surface px-4 py-3">
        <p className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Siapkan selama menunggu
        </p>
        <ul>
          {checklist.map((item) => (
            <li key={item} className="flex items-center gap-2.5 py-1.5 text-[13.5px]">
              <span
                className="size-[18px] shrink-0 rounded-md border-2 border-border"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
          {notifySupported && (
            <li className="flex items-center gap-2.5 py-1.5 text-[13.5px]">
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

      <section className="rounded-3xl bg-surface px-4 py-1">
        <div className="flex justify-between py-2 text-[13.5px]">
          <span className="text-muted-foreground">Total dibayar</span>
          <span>{rupiah(order.amount)}</span>
        </div>
        <div className="flex justify-between border-t border-border py-2 text-[13.5px]">
          <span className="text-muted-foreground">Metode</span>
          <span>{METHOD_LABEL[order.method] ?? String(order.method)}</span>
        </div>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        {typeof lastSyncedAt === "number" ? `Diperbarui ${snapshotAgeLabel(lastSyncedAt)}` : ""}
      </p>
    </div>
  );
}
