import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Page, btnRed, btnSoft } from "@/components/shell";
import { ReceiptLine, ReceiptPrinter, ReceiptRule } from "@/components/receipt-printer";
import { ManualDetails } from "@/components/esim-install";
import {
  guestAccessTokenFor,
  hasGuestOrderAccess,
  refreshOrdersFromServer,
  useOrders,
  type Order,
} from "@/lib/orders";
import { verifyMayarPayment } from "@/lib/mayar-settlement.fn";
import { ACTION_STAGES, useStagedLabel } from "@/lib/progress-stages";
import { effectiveOrderStatus, ORDER_STATUS_LABEL } from "@/lib/esim-status";
import {
  downloadReceiptPdf,
  formatReceiptAmount,
  formatReceiptDate,
  printReceiptWindow,
  receiptSteps,
  safeReceiptFileName,
  type ReceiptDocument,
} from "@/lib/receipt-print";
import { rupiah } from "@/lib/pricing";
import { SUPPORT_WHATSAPP_URL } from "@/lib/support-contact";
import { OfflineSnapshotBanner } from "@/components/offline-snapshot-banner";
import { TravelSupportDialog } from "@/components/travel-support-dialog";
import {
  buildTravelSnapshot,
  clearTravelSnapshot,
  isSnapshotStale,
  readTravelSnapshot,
  writeTravelSnapshot,
  type TravelSnapshot,
} from "@/lib/offline-travel-snapshot";
import { buildSupportContext, supportTopicsFor } from "@/lib/travel-support";
import { reorderIntent } from "@/lib/travel-journey";

export const Route = createFileRoute("/receipt/$id")({
  head: () => ({
    meta: [
      { title: "Struk pembayaran — Djiwa Travel" },
      { name: "description", content: "Struk pembayaran dan panduan pasang eSIM kamu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReceiptPage,
});

function buildReceiptDocument(order: Order): ReceiptDocument {
  const status = effectiveOrderStatus(order.status, order.expiresAt);
  const ready = status === "READY" || status === "INSTALLED";
  const quota =
    order.volumeBytes == null
      ? "Unlimited"
      : `${(order.volumeBytes / 1_000_000_000).toFixed(1)} GB`;
  const code = order.publicOrderCode ?? order.id.slice(0, 8).toUpperCase();

  const fields = [
    { label: "Tanggal", value: formatReceiptDate(order.createdAt) },
    { label: "Paket", value: order.packageName ?? order.packageId },
    { label: "Cakupan", value: order.locationCodes?.join(", ") || "Regional" },
    { label: "Kuota", value: quota },
    { label: "Masa aktif", value: order.durationDays ? `${order.durationDays} hari` : "-" },
    { label: "Metode", value: order.method === "qris" ? "QRIS" : "Virtual Account" },
    { label: "Tujuan email", value: order.email ?? "-" },
    { label: "WhatsApp", value: order.whatsapp ?? "-" },
    { label: "Status", value: ORDER_STATUS_LABEL[status] },
    { label: "Total", value: formatReceiptAmount(order.amount) },
  ];

  return {
    brand: "Djiwa Travel",
    title: "Struk pembayaran eSIM",
    code,
    statusLabel: ORDER_STATUS_LABEL[status],
    fields,
    // The QR payload is only part of the document once the eSIM exists.
    ...(ready && order.esim ? { lpa: order.esim.lpa } : {}),
    footer: [
      "Terima kasih telah mempercayakan perjalananmu pada Djiwa Travel.",
      "Struk ini dibuat otomatis dan sah tanpa tanda tangan.",
      "Bantuan: hubungi support lewat WhatsApp dari aplikasi.",
    ],
    fileName: safeReceiptFileName(code),
  };
}

function ReceiptPage() {
  const { id } = Route.useParams();
  const orders = useOrders();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<TravelSnapshot | null>(() => readTravelSnapshot(id));
  const pdfLabel = useStagedLabel(busy, ACTION_STAGES.receiptExport);
  const checkingLabel = useStagedLabel(checkingPayment, ACTION_STAGES.paymentCheck);

  // A refresh from the server can carry newer status, so settle once on arrival.
  useEffect(() => {
    void refreshOrdersFromServer().catch(() => undefined);
  }, []);

  const order = hasGuestOrderAccess(id) ? orders?.find((x) => x.id === id) : undefined;

  // The receipt and the QR are exactly what a customer needs with no connection, so keep a
  // device-local copy in step with the last authorized read.
  useEffect(() => {
    if (!order) return;
    const next = buildTravelSnapshot(order);
    if (writeTravelSnapshot(next)) setSnapshot(next);
  }, [order?.id, order?.status, order?.expiresAt, order?.esim?.lpa]);

  // Mayar may settle shortly after the redirect. Poll only while pending, stop on
  // terminal state, and keep a manual retry available instead of looping forever.
  useEffect(() => {
    if (!order) return;
    if (!["ORDER_CREATED", "WAITING_PAYMENT"].includes(order.status)) return;
    const token = guestAccessTokenFor(id);
    if (!token) return;
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    const poll = async () => {
      attempts += 1;
      try {
        const result = await verifyMayarPayment({ data: { orderId: id, accessToken: token } });
        await refreshOrdersFromServer();
        if (result.settled || attempts >= 6 || cancelled) return;
      } catch {
        if (attempts >= 6 || cancelled) return;
      }
      timer = window.setTimeout(() => void poll(), Math.min(1000 * 2 ** attempts, 8000));
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [id, order?.id, order?.status]);

  const retryPaymentCheck = async () => {
    const token = guestAccessTokenFor(id);
    if (!token || checkingPayment) return;
    setCheckingPayment(true);
    setNote("");
    try {
      const result = await verifyMayarPayment({ data: { orderId: id, accessToken: token } });
      await refreshOrdersFromServer();
      setNote(
        result.settled
          ? "Pembayaran terverifikasi. Status diperbarui."
          : "Pembayaran masih menunggu verifikasi.",
      );
    } catch {
      setNote("Belum bisa memeriksa pembayaran. Coba lagi nanti.");
    } finally {
      setCheckingPayment(false);
    }
  };

  if (!orders)
    return (
      <Page>
        <div className="mt-20 h-40 animate-pulse rounded-2xl bg-secondary" />
      </Page>
    );

  if (!order)
    return (
      <Page>
        <div className="mt-24 text-center">
          <p className="text-muted-foreground">Struk tidak ditemukan di perangkat ini.</p>
          <Link to="/my-esim" className={`${btnRed} mt-6`}>
            Lihat My eSIM
          </Link>
        </div>
      </Page>
    );

  const status = effectiveOrderStatus(order.status, order.expiresAt);
  const ready = status === "READY" || status === "INSTALLED";
  // Mirrors the order detail entry point: another purchase is only offered once this
  // order is settled. A pending or failed order needs support, not a second checkout.
  const reorder =
    ready || status === "EXPIRED"
      ? reorderIntent({ packageId: order.packageId, status, locationCodes: order.locationCodes })
      : null;
  const doc = buildReceiptDocument(order);
  const quota =
    order.volumeBytes == null
      ? "Unlimited"
      : `${(order.volumeBytes / 1_000_000_000).toFixed(1)} GB`;

  const savePdf = async () => {
    setBusy(true);
    setNote("");
    try {
      await downloadReceiptPdf(doc);
    } catch {
      setNote("Gagal membuat PDF. Gunakan tombol cetak sebagai gantinya.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <div className="print-hide flex items-center justify-between pt-2">
        <Link
          to={ready ? "/my-esim/$id" : "/order/$id"}
          params={{ id: order.id }}
          className="flex min-h-11 items-center gap-1.5 rounded-lg pr-2 text-[15px] text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Kembali
        </Link>
        <Link
          to="/my-esim"
          className="flex h-11 items-center text-sm font-semibold text-muted-foreground"
        >
          My eSIM
        </Link>
      </div>

      <h1 className="large-title mb-1 mt-2">Struk pembayaran</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Simpan sebagai PDF atau cetak, lalu pasang eSIM pakai panduan di bawah.
      </p>

      <ReceiptPrinter
        stage={ready ? "complete" : "processing"}
        statusText={ORDER_STATUS_LABEL[status]}
        footer={
          <div className="print-hide mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void savePdf()}
              className={`${btnRed} inline-flex items-center justify-center gap-2 disabled:opacity-50`}
            >
              <FileText className="size-4" aria-hidden="true" />
              {busy ? pdfLabel : "Unduh PDF"}
            </button>
            <button
              type="button"
              onClick={() => printReceiptWindow()}
              className={`${btnSoft} inline-flex items-center justify-center gap-2`}
            >
              <Printer className="size-4" aria-hidden="true" />
              Cetak struk
            </button>
            {note && <p className="text-xs text-destructive">{note}</p>}
            {(order.status === "ORDER_CREATED" || order.status === "WAITING_PAYMENT") && (
              <button
                type="button"
                disabled={checkingPayment}
                onClick={() => void retryPaymentCheck()}
                className={`${btnSoft} disabled:opacity-50`}
              >
                {checkingPayment ? checkingLabel : "Cek ulang pembayaran"}
              </button>
            )}
          </div>
        }
      >
        <p className="text-center font-semibold tracking-wide">{doc.brand}</p>
        <p className="mt-1 text-center text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Struk pembayaran
        </p>
        <ReceiptRule />
        <ReceiptLine
          label="Kode pesanan"
          value={order.publicOrderCode ?? order.id.slice(0, 8).toUpperCase()}
        />
        <ReceiptLine label="Tanggal" value={formatReceiptDate(order.createdAt)} />
        <ReceiptLine label="Status" value={ORDER_STATUS_LABEL[status]} />
        <ReceiptRule />
        <ReceiptLine label="Paket" value={order.packageName ?? order.packageId} />
        <ReceiptLine label="Cakupan" value={order.locationCodes?.join(", ") || "Regional"} />
        <ReceiptLine label="Kuota" value={quota} />
        <ReceiptLine
          label="Masa aktif"
          value={order.durationDays ? `${order.durationDays} hari` : "-"}
        />
        <ReceiptRule />
        <ReceiptLine label="Metode" value={order.method === "qris" ? "QRIS" : "Virtual Account"} />
        {order.email && <ReceiptLine label="Email" value={order.email} />}
        {order.whatsapp && <ReceiptLine label="WhatsApp" value={order.whatsapp} />}
        <ReceiptRule />
        <ReceiptLine label="Total" value={rupiah(order.amount)} strong />
        {ready && order.esim && (
          <>
            <ReceiptRule />
            <div className="flex flex-col items-center">
              <div className="rounded-xl bg-white p-2">
                <QRCodeSVG value={order.esim.lpa} size={132} />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Pindai untuk memasang eSIM</p>
            </div>
            <ManualDetails esim={order.esim} />
          </>
        )}
        <ReceiptRule />
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Struk dibuat otomatis oleh Djiwa Travel dan sah tanpa tanda tangan.
        </p>
      </ReceiptPrinter>

      <OfflineSnapshotBanner
        snapshot={snapshot}
        stale={snapshot ? isSnapshotStale(snapshot) : false}
        onClear={() => {
          clearTravelSnapshot(id);
          setSnapshot(null);
        }}
      />

      {/* Installation tutorial travels with the receipt. */}
      <section className="mt-8 rounded-2xl bg-surface p-4">
        <h2 className="text-base font-semibold">Cara pasang eSIM</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lakukan sebelum berangkat, cukup sekali. Butuh koneksi Wi-Fi.
        </p>
        <ol className="mt-4 divide-y divide-border/70">
          {receiptSteps().map((step) => {
            const [number, ...rest] = step.split(". ");
            return (
              <li key={step} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                  {number}
                </span>
                <span className="pt-0.5 text-sm">{rest.join(". ")}</span>
              </li>
            );
          })}
        </ol>
        <TravelSupportDialog
          open={supportOpen}
          onClose={() => setSupportOpen(false)}
          topics={supportTopicsFor(status, { hasQr: Boolean(order.esim) })}
          contextFor={(topic) =>
            buildSupportContext({
              topic,
              status,
              orderId: order.id,
              orderCode: order.publicOrderCode ?? null,
              packageName: order.packageName ?? order.packageId,
              destination: order.locationCodes?.join(", ") || "Regional",
              iccid: order.esim?.iccid ?? null,
              lastSyncedAt: snapshot?.savedAt ?? null,
            })
          }
          supportBaseUrl={SUPPORT_WHATSAPP_URL}
        />
        <div className="mt-5 flex flex-col gap-2">
          {reorder && (
            <>
              <Link
                to={reorder.href}
                params={{ id: reorder.packageId }}
                className={`${btnRed} text-center`}
              >
                {reorder.label}
              </Link>
              {reorder.fallbackDestinationCode && (
                <Link
                  to="/destination/$code"
                  params={{ code: reorder.fallbackDestinationCode }}
                  className={`${btnSoft} text-center`}
                >
                  Lihat paket lain untuk {reorder.fallbackDestinationCode}
                </Link>
              )}
              <p className="text-center text-[12px] text-muted-foreground">
                Harga dan ketersediaan dicek ulang saat checkout, jadi selalu mengikuti katalog
                terbaru.
              </p>
            </>
          )}
          <Link to="/order/$id" params={{ id: order.id }} className={btnSoft}>
            Buka status pesanan
          </Link>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className={`${btnSoft} text-center`}
          >
            Butuh bantuan? Hubungi support
          </button>
        </div>
      </section>
    </Page>
  );
}
