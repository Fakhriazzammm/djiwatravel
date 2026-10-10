import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Loader2, AlertCircle, Printer } from "lucide-react";
import { useState } from "react";
import { Page, btnPrimary, btnRed, btnSoft } from "@/components/shell";
import { EsimQr, InstallGuide, ManualDetails } from "@/components/esim-install";
import { rupiah } from "@/lib/pricing";
import { useOrders, type Order } from "@/lib/orders";

export const Route = createFileRoute("/order/$id")({
  head: () => ({
    meta: [
      { title: "Status pesanan — Djiwa Travel" },
      { name: "description", content: "Status pembayaran dan eSIM kamu." },
      { property: "og:title", content: "Status pesanan — Djiwa Travel" },
      { property: "og:description", content: "Status pembayaran dan eSIM kamu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const orders = useOrders();
  const [view, setView] = useState<"main" | "qr" | "guide">("main");
  if (!orders)
    return (
      <Page tabs={false}>
        <div className="mt-20 h-40 animate-pulse rounded-2xl bg-secondary" />
      </Page>
    );
  const o = orders.find((x) => x.id === id);
  if (!o)
    return (
      <Page>
        <p className="mt-20 text-center text-muted-foreground">Pesanan tidak ditemukan.</p>
      </Page>
    );
  const packageName = o.packageName ?? o.packageId;
  const locationLabel = o.locationCodes?.join(", ") || "Regional";
  const quotaLabel =
    o.volumeBytes == null ? "Unlimited" : `${(o.volumeBytes / 1_000_000_000).toFixed(1)} GB`;
  const durationLabel = o.durationDays ? `${o.durationDays} hari` : "Durasi tersimpan di pesanan";

  if (o.status === "ORDER_CREATED" || o.status === "WAITING_PAYMENT") {
    return (
      <Page tabs={false}>
        <p className="pt-8 text-center text-sm text-muted-foreground">Pesanan tersimpan</p>
        <h1 className="mt-1 text-center text-3xl font-bold">{rupiah(o.amount)}</h1>
        <div className="mt-6 rounded-2xl bg-surface p-5">
          <p className="font-semibold">{packageName}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {locationLabel} · {quotaLabel} · {durationLabel}
          </p>
          {o.publicOrderCode && (
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              Kode pesanan: {o.publicOrderCode}
            </p>
          )}
        </div>
        <div className="mt-4 rounded-2xl border border-border p-4 text-center">
          <p className="font-semibold">Pembayaran belum tersedia</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tagihan Mayar sudah dibuat. Selesaikan pembayaran untuk memproses eSIM.
          </p>
          {o.paymentUrl && (
            <a href={o.paymentUrl} target="_blank" rel="noreferrer" className={`${btnRed} mt-4 block`}>
              Lanjutkan pembayaran
            </a>
          )}
        </div>
        <InvoiceCard order={o} />
        <Link to="/catalog" className="mt-5 block text-center text-sm font-semibold text-primary">
          Kembali ke katalog
        </Link>
      </Page>
    );
  }

  if (o.status === "PAID" || o.status === "PROVISIONING") {
    return (
      <Page tabs={false}>
        <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
          <Loader2 className="size-10 animate-spin text-brand-red" />
          <h1 className="mt-6 text-2xl font-bold">Pembayaran diterima</h1>
          <p className="mt-2 text-muted-foreground">Sedang menyiapkan eSIM kamu…</p>
        </div>
      </Page>
    );
  }

  if (o.status === "PROVISIONING_FAILED" || o.status === "REFUNDED") {
    return (
      <Page tabs={false}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <AlertCircle className="size-12 text-brand-red" />
          <h1 className="mt-6 text-2xl font-bold">
            {o.status === "REFUNDED"
              ? "Dana dikembalikan"
              : "Pembayaran berhasil. eSIM sedang kami proses."}
          </h1>
        </div>
        {o.status !== "REFUNDED" && (
          <p className="mt-4 text-sm text-muted-foreground">
            Provisioning otomatis belum diaktifkan.
          </p>
        )}
        <a href="https://wa.me/" className={`${btnSoft} mt-3`}>
          Hubungi Support
        </a>
      </Page>
    );
  }

  if (o.status === "CANCELLED" || o.status === "EXPIRED") {
    return (
      <Page tabs={false}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <AlertCircle className="size-12 text-muted-foreground" />
          <h1 className="mt-6 text-2xl font-bold">
            {o.status === "EXPIRED" ? "Paket sudah kedaluwarsa" : "Pesanan dibatalkan"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Silakan pilih paket eSIM lain jika ingin melanjutkan perjalanan.
          </p>
          <Link to="/catalog" className={`${btnPrimary} mt-6`}>
            Lihat paket eSIM
          </Link>
        </div>
      </Page>
    );
  }

  const esim = o.esim!;
  if (view === "qr")
    return (
      <Page tabs={false}>
        <button
          onClick={() => setView("main")}
          className="flex h-11 items-center text-[16px] text-brand-red"
        >
          ‹ Kembali
        </button>
        <h1 className="large-title mb-4">QR Code</h1>
        <EsimQr esim={esim} />
        <h2 className="mt-8 mb-2 px-1 text-sm font-medium text-muted-foreground">Pasang manual</h2>
        <ManualDetails esim={esim} />
      </Page>
    );
  if (view === "guide")
    return (
      <Page tabs={false}>
        <button
          onClick={() => setView("main")}
          className="flex h-11 items-center text-[16px] text-brand-red"
        >
          ‹ Kembali
        </button>
        <h1 className="large-title mb-4">Panduan Instalasi</h1>
        <InstallGuide />
      </Page>
    );

  return (
    <Page tabs={false}>
      <div className="flex flex-col items-center pt-12 text-center">
        <div className="animate-pop flex size-20 items-center justify-center rounded-full bg-success">
          <Check className="size-10 text-primary-foreground" strokeWidth={3} />
        </div>
        <h1 className="mt-6 text-3xl font-bold">eSIM kamu siap! ✨</h1>
        <p className="mt-3 text-lg">🌐 {packageName}</p>
        <p className="text-muted-foreground">
          {quotaLabel} · {durationLabel}
        </p>
      </div>
      <div className="mt-10 space-y-3">
        <a
          href={`https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(esim.lpa)}`}
          className={btnRed}
        >
          Pasang eSIM
        </a>
        <button onClick={() => setView("qr")} className={btnSoft}>
          Lihat QR Code
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px] font-medium text-brand-red">
        <button onClick={() => setView("guide")} className="h-11 rounded-xl">
          Panduan
        </button>
        <Link to="/my-esim" className="flex h-11 items-center justify-center rounded-xl">
          Simpan
        </Link>
        <a href="https://wa.me/" className="flex h-11 items-center justify-center rounded-xl">
          Support
        </a>
      </div>
      <InvoiceCard order={o} />
    </Page>
  );
}

function InvoiceCard({ order }: { order: Order }) {
  return (
    <section className="invoice-card mt-6 rounded-2xl bg-surface p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice</p>
          <p className="mt-1 font-semibold">Djiwa Travel</p>
          <p className="text-muted-foreground">#{order.publicOrderCode ?? order.id.slice(0, 8)}</p>
        </div>
        <button type="button" onClick={() => window.print()} className="print-button flex min-h-10 items-center gap-2 rounded-xl bg-secondary px-3 font-semibold" aria-label="Cetak atau simpan invoice sebagai PDF">
          <Printer className="size-4" /> Cetak / PDF
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-2 border-t pt-3">
        <dt className="text-muted-foreground">Produk</dt><dd className="text-right font-medium">{order.packageName ?? order.packageId}</dd>
        <dt className="text-muted-foreground">Pembayaran</dt><dd className="text-right font-medium uppercase">{order.method}</dd>
        <dt className="text-muted-foreground">Total</dt><dd className="text-right font-semibold">{rupiah(order.amount)}</dd>
      </dl>
    </section>
  );
}
