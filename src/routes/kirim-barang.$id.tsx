import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { BackBar, Page } from "@/components/shell";
import {
  CopyButton,
  DropPointCard,
  Row,
  ShippingStatusBadge,
  shippingPrimaryBtn,
  shippingSoftBtn,
} from "@/components/shipping/shipping-ui";
import { ProofPhotos } from "@/components/shipping/shipping-photos";
import { ShippingLabelCard } from "@/components/shipping/shipping-label";
import { usePrintAction } from "@/hooks/use-print-action";
import {
  cancelShippingBooking,
  deleteMyShippingPhoto,
  confirmShippingDelivered,
  getMyShippingOrder,
  payShippingOrder,
  verifyShippingPayment,
} from "@/lib/shipping.fn";
import {
  SHIPPING_STATUS_LABEL,
  fmtDate,
  fmtDateTime,
  SHIPPING_STEPS,
  formatIdr,
  formatKg,
  shippingIsDead,
  type ShippingStatus,
} from "@/lib/shipping";

export const Route = createFileRoute("/kirim-barang/$id")({
  validateSearch: (search: Record<string, unknown>): { baru?: boolean } =>
    search["baru"] === true || search["baru"] === "true" ? { baru: true } : {},
  head: () => ({
    meta: [
      { title: "Pengiriman — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: ({ params }) => getMyShippingOrder({ data: { orderId: params.id } }),
  errorComponent: () => (
    <Page tabs={false}>
      <BackBar title="Pengiriman" fallbackTo="/kirim-barang/pengiriman" />
      <p className="mt-10 text-center text-[13px] text-muted-foreground">
        Pengiriman tidak ditemukan atau kamu belum masuk.
      </p>
    </Page>
  ),
  component: ShipmentDetail,
});

function ShipmentDetail() {
  const order = Route.useLoaderData();
  const { baru } = Route.useSearch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const print = usePrintAction();
  const status = order.status as ShippingStatus;
  const pending = status === "PAYMENT_PENDING";

  // Coming back from Mayar: confirm the payment with the provider, then show the result.
  useEffect(() => {
    if (!pending) return;
    let live = true;
    const check = () =>
      verifyShippingPayment({ data: { orderId: order.id } })
        .then((r) => {
          if (live && r.status !== "PAYMENT_PENDING") void router.invalidate();
        })
        .catch(() => undefined);
    void check();
    const id = setInterval(check, 8000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [pending, order.id, router]);

  async function run(task: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await task();
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    setBusy(true);
    try {
      const { paymentUrl } = await payShippingOrder({ data: { orderId: order.id } });
      window.location.href = paymentUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pembayaran belum bisa dibuat.");
      setBusy(false);
    }
  }

  const reached = new Map<string, string>(order.events.map((e) => [e.status, e.at]));
  const dead = shippingIsDead(status);
  const billed = order.totalIdr !== null;

  return (
    <Page tabs={false}>
      <BackBar
        title={baru && status === "AWAITING_DROP" ? "Booking dibuat" : order.code}
        fallbackTo="/kirim-barang/pengiriman"
        action={<ShippingStatusBadge status={status} />}
      />

      {status === "AWAITING_DROP" && (
        <>
          <ShippingLabelCard order={order} dropPoint={order.dropPoint} />
          <p className="ios-section-label mt-4">Langkah berikutnya</p>
          <ol className="ios-group divide-y divide-border/70 text-[13px]">
            <li className="ios-row">
              <span className="ios-tile bg-secondary text-[12px] font-bold">1</span>
              <span className="font-semibold">Cetak atau simpan label QR, tempel di paket</span>
            </li>
            <li className="ios-row">
              <span className="ios-tile bg-secondary text-[12px] font-bold">2</span>
              <span className="font-semibold">
                {order.inboundMode === "COURIER"
                  ? "Kirim ke drop point lewat kurir"
                  : "Antar ke drop point"}{" "}
                sebelum {order.dropDeadlineAt ? fmtDate(order.dropDeadlineAt) : "batas waktu"}
              </span>
            </li>
            <li className="ios-row">
              <span className="ios-tile bg-secondary text-[12px] font-bold">3</span>
              <span className="font-semibold">Kami timbang, kamu dapat tagihan</span>
            </li>
          </ol>
          <p className="ios-section-label mt-4">Foto bukti</p>
          <ProofPhotos
            orderId={order.id}
            photoIds={order.proofPhotoIds}
            review={order.photoReview}
            note={order.photoReviewNote}
            min={order.minPhotos}
            editable
            onChanged={() => void router.invalidate()}
            onRemove={(photoId) => deleteMyShippingPhoto({ data: { orderId: order.id, photoId } })}
          />
          <p className="ios-section-label mt-4">Alamat drop point</p>
          <DropPointCard point={order.dropPoint} />
          {order.inboundMode === "COURIER" && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Lewat kurir: {order.inboundCourier}, resi {order.inboundTracking}.
            </p>
          )}
        </>
      )}

      {status === "RECEIVED" && (
        <div className="ios-card p-3">
          <p className="text-[14px] font-bold">Paketmu sudah di drop point</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Tim kami sedang menimbang. Tagihan segera dikirim lewat notifikasi.
          </p>
        </div>
      )}

      {status === "RECEIVED" && order.proofPhotoIds.length > 0 && (
        <div className="mt-3">
          <ProofPhotos
            orderId={order.id}
            photoIds={order.proofPhotoIds}
            review={order.photoReview}
            note={order.photoReviewNote}
            min={order.minPhotos}
            editable={false}
            onChanged={() => void router.invalidate()}
            onRemove={async () => undefined}
          />
        </div>
      )}

      {billed && (
        <div className="ios-card mt-3 p-3">
          {order.photoIds.length > 0 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto">
              {order.photoIds.map((id) => (
                <img
                  key={id}
                  src={`/api/shipping-photo/${id}`}
                  alt="Foto timbang dan isi paket"
                  className="h-20 w-28 shrink-0 rounded-xl object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          )}
          <dl className="space-y-1 text-[12px]">
            <Row label="Berat timbang" value={order.weighedKg ? formatKg(order.weighedKg) : "-"} />
            <Row label="Dibulatkan" value={order.billedKg ? formatKg(order.billedKg) : "-"} />
            <Row
              label={`${order.billedKg ? formatKg(order.billedKg) : ""} × ${formatIdr(order.rateIdrPerKg)}`}
              value={formatIdr(order.freightIdr ?? 0)}
            />
            <Row label="Packing tambahan" value={formatIdr(order.packingIdr)} />
            <Row label="Total" value={formatIdr(order.totalIdr ?? 0)} strong />
          </dl>
          {order.weighNote && (
            <p className="mt-1 text-[11px] text-muted-foreground">Catatan: {order.weighNote}</p>
          )}
          <button
            type="button"
            disabled={print.busy !== null}
            onClick={() =>
              print.run("bill", async () =>
                (await import("@/lib/shipping-print")).downloadBillPdf(order),
              )
            }
            className="tap mt-2 text-[11px] font-semibold text-brand-red underline disabled:opacity-50"
          >
            Unduh rincian tagihan (PDF)
          </button>
          {pending && (
            <>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Bayar sebelum{" "}
                {order.paymentExpiresAt ? fmtDateTime(order.paymentExpiresAt) : "batas waktu"} agar
                paket tetap masuk jadwal kirim.
              </p>
              <button
                type="button"
                onClick={pay}
                disabled={busy}
                className={`${shippingPrimaryBtn} mt-2`}
              >
                {busy ? "Membuka pembayaran…" : `Bayar ${formatIdr(order.totalIdr ?? 0)}`}
              </button>
            </>
          )}
        </div>
      )}

      {(status === "SHIPPED" || status === "ARRIVED" || status === "DELIVERED") &&
        order.trackingNumber && (
          <div className="ios-card mt-3 flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Kurir dan resi</p>
              <p className="text-[13px] font-semibold">{order.courier}</p>
              <p className="truncate text-[12px] text-muted-foreground">{order.trackingNumber}</p>
            </div>
            <CopyButton value={order.trackingNumber} />
          </div>
        )}
      {(status === "SHIPPED" || status === "ARRIVED" || status === "DELIVERED") && (
        <button
          type="button"
          disabled={print.busy !== null}
          onClick={() =>
            print.run("proof", async () =>
              (await import("@/lib/shipping-print")).downloadProofPdf(order),
            )
          }
          className={`${shippingSoftBtn} mt-3`}
        >
          Unduh bukti pengiriman (PDF)
        </button>
      )}
      {status === "ARRIVED" && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(
              () => confirmShippingDelivered({ data: { orderId: order.id } }),
              "Belum bisa dikonfirmasi.",
            )
          }
          className={`${shippingPrimaryBtn} mt-3`}
        >
          Paket sudah diterima
        </button>
      )}

      {dead && (
        <div className="ios-card mt-3 p-3">
          <p className="text-[14px] font-bold">{SHIPPING_STATUS_LABEL[status]}</p>
          {order.statusReason && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{order.statusReason}</p>
          )}
          {status === "CANCELLED" && order.paidAt && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Karena sudah dibayar, refund diproses tim kami.
            </p>
          )}
          {status === "EXPIRED" && billed && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Waktu pembayaran habis. Hubungi kami bila paketmu masih ingin dikirim.
            </p>
          )}
          <Link to="/kirim-barang" className={`${shippingSoftBtn} mt-2`}>
            Kirim barang lagi
          </Link>
        </div>
      )}

      {!dead && (
        <>
          <p className="ios-section-label mt-4">Status</p>
          <ol className="ios-group p-3">
            {SHIPPING_STEPS.map((step, index) => {
              const at = reached.get(step);
              return (
                <li key={step} className="flex items-start gap-2.5 py-1.5">
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white ${at ? "bg-primary" : "bg-border"}`}
                  >
                    {at ? (
                      <Check className="size-3" aria-hidden="true" />
                    ) : (
                      <span className="text-[9px]">{index + 1}</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-[13px] ${at ? "font-semibold" : "text-muted-foreground"}`}
                    >
                      {SHIPPING_STATUS_LABEL[step]}
                      {step === "RECEIVED" && order.weighedKg
                        ? ` · ${formatKg(order.weighedKg)}`
                        : ""}
                    </span>
                    {at && (
                      <span className="block text-[10px] text-muted-foreground">
                        {fmtDateTime(at)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {status === "AWAITING_DROP" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!confirmCancel) {
              setConfirmCancel(true);
              return;
            }
            void run(
              () => cancelShippingBooking({ data: { orderId: order.id } }),
              "Booking belum bisa dibatalkan.",
            );
          }}
          className={`${shippingSoftBtn} mt-3 text-destructive`}
        >
          {confirmCancel ? "Ketuk lagi untuk membatalkan booking" : "Batalkan booking"}
        </button>
      )}

      <p className="ios-section-label mt-4">Dikirim ke</p>
      <div className="ios-group p-3 text-[12px]">
        <p className="text-[13px] font-semibold">{order.recipientName}</p>
        <p className="text-muted-foreground">{order.phone}</p>
        <p className="text-muted-foreground">
          {order.addressLine}, {order.city}, {order.prefecture} {order.postalCode}
        </p>
      </div>
      <p className="ios-section-label mt-3">Barang</p>
      <dl className="ios-group space-y-1 p-3 text-[12px]">
        <Row label="Kategori" value={order.category} />
        <Row label="Isi" value={order.contents} />
        <Row label="Nilai" value={formatIdr(order.declaredValueIdr)} />
        {!billed && (
          <Row
            label={`Estimasi ${formatKg(order.estimatedKg)}`}
            value={formatIdr(order.estimateIdr)}
          />
        )}
      </dl>

      <Link
        to="/support"
        className="tap ios-btn mt-3 w-full border border-border/70 bg-surface text-[13px]"
      >
        Hubungi Djiwa
      </Link>
    </Page>
  );
}
