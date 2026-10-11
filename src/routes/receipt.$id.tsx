import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Page, btnRed, btnSoft } from "@/components/shell";
import { ReceiptLine, ReceiptPrinter, ReceiptRule } from "@/components/receipt-printer";
import { ManualDetails } from "@/components/esim-install";
import { guestAccessTokenFor, refreshOrdersFromServer, useOrders, type Order } from "@/lib/orders";
import { verifyMayarPayment } from "@/lib/mayar-settlement.server";
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
import { SUPPORT_WHATSAPP_URL } from "@/lib/guest-order-access.server";

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
  const quota = order.volumeBytes == null
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

  // A refresh from the server can carry newer status, so settle once on arrival.
  useEffect(() => {
    void refreshOrdersFromServer().catch(() => undefined);
  }, []);

  const order = orders?.find((x) => x.id === id);

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
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [id, order?.id, order?.status]);

  const retryPaymentCheck = async () => {
    const token = guestAccessTokenFor(id);
    if (!token || checkingPayment) return;
    setCheckingPayment(true);
    setNote("");
    try {
      const result = await verifyMayarPayment({ data: { orderId: id, accessToken: token } });
      await refreshOrdersFromServer();
      setNote(result.settled ? "Pembayaran terverifikasi. Status diperbarui." : "Pembayaran masih menunggu verifikasi.");
    } catch {
      setNote("Belum bisa memeriksa pembayaran. Coba lagi nanti.");
    } finally {
      setCheckingPayment(false);
    }
  };

  if (!orders)
    return (
      <Page tabs={false}>
        <div className="mt-20 h-40 animate-pulse rounded-2xl bg-secondary" />
      </Page>
    );

  if (!order)
    return (
      <Page tabs={false}>
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
  const doc = buildReceiptDocument(order);
  const quota = order.volumeBytes == null
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
    <Page tabs={false}>
      <div className="print-hide flex items-center justify-between pt-2">
        <Link
          to={ready ? "/my-esim/$id" : "/order/$id"}
          params={{ id: order.id }}
          className="flex h-11 items-center gap-1.5 text-[16px] text-brand-red"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Kembali
        </Link>
        <Link to="/my-esim" className="flex h-11 items-center text-sm font-semibold text-muted-foreground">
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
              {busy ? "Menyiapkan PDF…" : "Unduh PDF"}
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
              <button type="button" disabled={checkingPayment} onClick={() => void retryPaymentCheck()} className={`${btnSoft} disabled:opacity-50`}>
                {checkingPayment ? "Memeriksa pembayaran…" : "Cek ulang pembayaran"}
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
        <ReceiptLine label="Kode pesanan" value={order.publicOrderCode ?? order.id.slice(0, 8).toUpperCase()} />
        <ReceiptLine label="Tanggal" value={formatReceiptDate(order.createdAt)} />
        <ReceiptLine label="Status" value={ORDER_STATUS_LABEL[status]} />
        <ReceiptRule />
        <ReceiptLine label="Paket" value={order.packageName ?? order.packageId} />
        <ReceiptLine label="Cakupan" value={order.locationCodes?.join(", ") || "Regional"} />
        <ReceiptLine label="Kuota" value={quota} />
        <ReceiptLine label="Masa aktif" value={order.durationDays ? `${order.durationDays} hari` : "-"} />
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

      {/* Installation tutorial travels with the receipt. */}
      <section className="mt-8 rounded-2xl bg-surface p-5">
        <h2 className="text-base font-semibold">Cara pasang eSIM</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lakukan sebelum berangkat, cukup sekali. Butuh koneksi Wi-Fi.
        </p>
        <ol className="mt-4 space-y-3">
          {receiptSteps().map((step) => {
            const [number, ...rest] = step.split(". ");
            return (
              <li key={step} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {number}
                </span>
                <span className="pt-0.5 text-sm">{rest.join(". ")}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex flex-col gap-2">
          <Link to="/order/$id" params={{ id: order.id }} className={btnSoft}>
            Buka status pesanan
          </Link>
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className={`${btnSoft} text-center`}>
            Butuh bantuan? Hubungi support
          </a>
        </div>
      </section>
    </Page>
  );
}
