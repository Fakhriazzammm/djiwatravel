import { useState } from "react";
import { toast } from "sonner";
import { scanOps } from "@/lib/shipping-ops.fn";
import { formatKg, type Hub, type ShippingStatus } from "@/lib/shipping";
import { formatAdminDateTime } from "@/lib/admin-display";
import type { QueueItem } from "./ops-types";

/** What one tap can do for a parcel in a hub's list, without opening the camera. */
function actionFor(hub: Hub, status: ShippingStatus) {
  if (hub === "TASIK" && status === "AWAITING_DROP")
    return { label: "Terima", mode: "receive" as const };
  if (hub === "TASIK" && status === "RECEIVED") return { label: "Timbang", mode: "weigh" as const };
  if (hub === "TASIK" && status === "PAID") return { label: "Muat", mode: "load" as const };
  if (hub === "BANDUNG" && status === "TO_BANDUNG")
    return { label: "Check-in", mode: "checkin" as const };
  if (hub === "BANDUNG" && status === "AT_BANDUNG") return { label: "Muat", mode: "load" as const };
  if (hub === "JAKARTA" && status === "TO_JAKARTA")
    return { label: "Check-in", mode: "checkin" as const };
  if (hub === "JAKARTA" && status === "AT_JAKARTA")
    return { label: "Serah", mode: "load" as const };
  return null;
}

const SECTION: Record<string, string> = {
  AWAITING_DROP: "Akan datang",
  RECEIVED: "Perlu ditimbang",
  PAYMENT_PENDING: "Menunggu pembayaran",
  PAID: "Siap dimuat",
  TO_BANDUNG: "Dalam perjalanan ke sini",
  AT_BANDUNG: "Siap dimuat",
  TO_JAKARTA: "Dalam perjalanan ke sini",
  AT_JAKARTA: "Siap diserahkan",
};
const ORDER: ShippingStatus[] = [
  "RECEIVED",
  "TO_BANDUNG",
  "TO_JAKARTA",
  "PAID",
  "AT_BANDUNG",
  "AT_JAKARTA",
  "AWAITING_DROP",
  "PAYMENT_PENDING",
];

/**
 * The hub's work list. Each parcel has the one button that fits its state (receive, weigh, check in,
 * load), so a damaged QR or a quick catch-up never needs the camera.
 */
export function OpsQueue({
  hub,
  items,
  error,
  activeBatchId,
  onWeigh,
  onProblem,
  onChanged,
}: {
  hub: Hub;
  items: QueueItem[] | null;
  error: string;
  activeBatchId: string | null;
  onWeigh: (orderId: string) => void;
  onProblem: (orderId: string, code: string) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(item: QueueItem, mode: "receive" | "checkin" | "load") {
    if (mode === "load" && !activeBatchId) {
      toast.error("Buka batch dulu di tab Batch, lalu muat paketnya.");
      return;
    }
    setBusy(item.id);
    try {
      const result = await scanOps({
        data: {
          code: item.code,
          hub,
          mode,
          ...(mode === "load" && activeBatchId ? { batchId: activeBatchId } : {}),
        },
      });
      if (!result.found) toast.error("Paket tidak ditemukan");
      else if (
        result.kind === "parcel" &&
        ["received", "checked_in", "loaded"].includes(result.outcome)
      ) {
        toast.success(
          `${item.code} ${result.outcome === "loaded" ? "dimuat" : result.outcome === "received" ? "diterima" : "check-in"}`,
        );
        onChanged();
      } else if (result.kind === "parcel") toast.error(result.message ?? "Belum bisa diproses");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tindakan gagal.");
    } finally {
      setBusy(null);
    }
  }

  if (error)
    return (
      <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-[12px] text-destructive">
        {error}
      </p>
    );
  if (items === null) return <p className="text-[12px] text-muted-foreground">Memuat antrian…</p>;
  if (items.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-center">
        <p className="text-[14px] font-semibold">Antrian kosong</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Tidak ada paket yang menunggu di lokasi ini.
        </p>
      </div>
    );

  const groups = ORDER.map((status) => ({
    status,
    rows: items.filter((i) => i.status === status),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.status}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {SECTION[g.status]} · {g.rows.length}
          </p>
          <ul className="space-y-1.5">
            {g.rows.map((item) => {
              const action = actionFor(hub, item.status);
              const movable = [
                "PAID",
                "TO_BANDUNG",
                "AT_BANDUNG",
                "TO_JAKARTA",
                "AT_JAKARTA",
              ].includes(item.status);
              return (
                <li key={item.id} className="rounded-2xl border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[14px] font-bold">{item.code}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {item.recipientName}, {item.prefecture} · {formatKg(item.kg)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {formatAdminDateTime(item.updatedAt)}
                        {item.openBatchCode ? ` · di ${item.openBatchCode}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {action && !(action.mode === "load" && item.openBatchCode) && (
                        <button
                          type="button"
                          disabled={busy === item.id}
                          onClick={() =>
                            action.mode === "weigh" ? onWeigh(item.id) : void run(item, action.mode)
                          }
                          className="tap min-h-10 rounded-xl bg-brand-red px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                        >
                          {action.label}
                        </button>
                      )}
                      {movable && (
                        <button
                          type="button"
                          onClick={() => onProblem(item.id, item.code)}
                          className="tap min-h-8 text-[11px] font-semibold text-destructive"
                        >
                          Rusak / hilang
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
