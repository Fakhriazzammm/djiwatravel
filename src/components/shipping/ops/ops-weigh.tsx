import { useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { compressReceiptPhoto } from "@/lib/receipt-image";
import { getOpsOrder } from "@/lib/shipping-ops.fn";
import { runAdminShippingAction } from "@/lib/shipping.fn";
import { SHIPPING_MAX_PHOTOS, formatIdr, formatKg, quoteShipping } from "@/lib/shipping";
import { bigBtn, field } from "./ops-types";

type Order = Awaited<ReturnType<typeof getOpsOrder>>;

/**
 * The weigh form at the drop point: the parcel's proof photos next to the scale, the weight, and one
 * tap to send the bill. Opens from a scan; Tasikmalaya staff and Admin only.
 */
export function OpsWeigh({
  orderId,
  onClose,
  onDone,
}: {
  orderId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [weighed, setWeighed] = useState("");
  const [packing, setPacking] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const weightRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await getOpsOrder({ data: { orderId } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengiriman belum bisa dimuat.");
    }
  }, [orderId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (order) weightRef.current?.focus();
  }, [order]);

  if (!order) return <p className="text-[12px] text-muted-foreground">Memuat…</p>;

  const kg = Number(weighed.replace(",", "."));
  const packingIdr = Number(packing.replace(/\D/g, "")) || 0;
  const quote =
    Number.isFinite(kg) && kg > 0
      ? quoteShipping({
          weighedKg: kg,
          rateIdrPerKg: order.rateIdrPerKg,
          minKg: order.minKg,
          roundKg: order.roundKg,
          packingIdr,
        })
      : null;
  const billable = order.status === "RECEIVED" || order.status === "EXPIRED";

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressReceiptPhoto(file);
      const form = new FormData();
      form.set("orderId", orderId);
      form.set("as", "admin");
      form.set("hub", "TASIK");
      form.set("photo", blob, "timbang.jpg");
      const response = await fetch("/api/shipping-photo", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Foto belum terunggah");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Foto belum terunggah");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onClose}
        className="tap min-h-10 text-[13px] font-semibold text-brand-red"
      >
        ‹ Kembali ke scan
      </button>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="font-mono text-[20px] font-bold">{order.code}</p>
        <p className="text-[13px] font-medium">
          {order.recipientName}, {order.prefecture} · {order.category}: {order.contents}
        </p>
        <p className="text-[12px] text-muted-foreground">
          Estimasi {formatKg(order.estimatedKg)} · tarif {formatIdr(order.rateIdrPerKg)}/kg
        </p>
      </div>

      {order.proofPhotoIds.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Foto dari pelanggan (cocokkan dengan paket)
          </p>
          <div className="flex gap-1.5 overflow-x-auto">
            {order.proofPhotoIds.map((id) => (
              <a
                key={id}
                href={`/api/shipping-photo/${id}?admin=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <img
                  src={`/api/shipping-photo/${id}?admin=1`}
                  alt="Foto isi paket dari pelanggan"
                  className="h-24 w-32 rounded-xl object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      )}
      {order.proofPhotoIds.length < order.minPhotos && (
        <p className="text-[12px] font-semibold text-[#9a6100]">
          Foto pelanggan belum lengkap ({order.proofPhotoIds.length} dari {order.minPhotos}).
        </p>
      )}

      {billable ? (
        <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-muted-foreground">
                Berat timbang (kg)
              </span>
              <input
                ref={weightRef}
                className={`${field} text-[18px] font-bold`}
                inputMode="decimal"
                value={weighed}
                onChange={(e) => setWeighed(e.target.value)}
                placeholder="2,4"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-muted-foreground">
                Biaya packing (Rp)
              </span>
              <input
                className={field}
                inputMode="numeric"
                value={packing}
                onChange={(e) => setPacking(e.target.value)}
              />
            </label>
          </div>
          <input
            className={field}
            value={note}
            maxLength={400}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan untuk pelanggan (opsional)"
            aria-label="Catatan untuk pelanggan"
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Foto timbang"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={busy || order.photoIds.length >= SHIPPING_MAX_PHOTOS}
              onClick={() => fileRef.current?.click()}
              className="tap inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-[13px] font-semibold disabled:opacity-50"
            >
              <Camera className="size-4" aria-hidden="true" />
              Foto timbang ({order.photoIds.length}/{SHIPPING_MAX_PHOTOS})
            </button>
          </div>
          {quote && (
            <div className="rounded-xl bg-secondary p-3 text-[13px]">
              <p>
                {formatKg(kg)} dibulatkan {formatKg(quote.billedKg)} ×{" "}
                {formatIdr(order.rateIdrPerKg)}
              </p>
              <p className="text-[18px] font-bold">Total {formatIdr(quote.totalIdr)}</p>
            </div>
          )}
          <button
            type="button"
            disabled={busy || !quote}
            onClick={async () => {
              setBusy(true);
              try {
                await runAdminShippingAction({
                  data: {
                    orderId,
                    action: "bill",
                    weighedKg: kg,
                    packingIdr,
                    ...(note.trim() ? { note: note.trim() } : {}),
                  },
                });
                toast.success("Tagihan dikirim ke pelanggan");
                onDone();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Tagihan gagal dikirim.");
              } finally {
                setBusy(false);
              }
            }}
            className={`${bigBtn} bg-brand-red text-white`}
          >
            Kirim tagihan
          </button>
        </div>
      ) : (
        <p className="rounded-xl bg-secondary p-3 text-[13px]">
          Status paket ini {order.statusLabel.toLowerCase()}. Tagihan hanya untuk paket yang sudah
          diterima.
        </p>
      )}
    </div>
  );
}
