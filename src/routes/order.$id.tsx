import { createFileRoute, Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Page, btnPrimary, btnRed, btnSoft } from "@/components/shell";
import { EsimQr, InstallGuide, ManualDetails } from "@/components/esim-install";
import { getDest, getPkg, gbLabel } from "@/lib/catalog";
import { rupiah } from "@/lib/pricing";
import { simulatePaid, useOrders } from "@/lib/orders";

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
  if (!orders) return <Page tabs={false}><div className="mt-20 h-40 animate-pulse rounded-2xl bg-secondary" /></Page>;
  const o = orders.find((x) => x.id === id);
  if (!o) return <Page><p className="mt-20 text-center text-muted-foreground">Pesanan tidak ditemukan.</p></Page>;
  const p = getPkg(o.packageId)!;
  const d = getDest(p.dest)!;

  if (o.status === "ORDER_CREATED" || o.status === "WAITING_PAYMENT") {
    return (
      <Page tabs={false}>
        <p className="pt-8 text-center text-sm text-muted-foreground">Menunggu pembayaran</p>
        <h1 className="mt-1 text-center text-4xl font-bold">{rupiah(o.amount)}</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">{d.flag} {d.nameId} · {gbLabel(p.dataGb)}</p>
        <div className="mt-8 flex flex-col items-center rounded-2xl bg-surface p-6">
          {o.method === "qris" ? (
            <>
              <p className="mb-4 font-brand text-xl font-black tracking-widest">QRIS</p>
              <div className="rounded-xl bg-white p-3"><QRCodeSVG value={"DEMO-QRIS-" + o.id} size={210} /></div>
              <p className="mt-4 text-center text-sm text-muted-foreground">Scan pakai aplikasi e-wallet atau m-banking</p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Nomor Virtual Account</p>
              <p className="mt-2 font-mono text-2xl font-semibold tracking-wider">8808 {o.id.slice(-8)}</p>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Mode demo — tekan tombol di bawah untuk mensimulasikan pembayaran.</p>
        <button onClick={() => simulatePaid(o.id)} className={`${btnPrimary} mt-4`}>Saya sudah bayar (demo)</button>
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
          <h1 className="mt-6 text-2xl font-bold">{o.status === "REFUNDED" ? "Dana dikembalikan" : "Pembayaran berhasil. eSIM sedang kami proses."}</h1>
        </div>
        {o.status !== "REFUNDED" && <button onClick={() => simulatePaid(o.id)} className={btnPrimary}>Coba Lagi</button>}
        <a href="https://wa.me/" className={`${btnSoft} mt-3`}>Hubungi Support</a>
      </Page>
    );
  }

  if (o.status === "CANCELLED" || o.status === "EXPIRED") {
    return (
      <Page tabs={false}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <AlertCircle className="size-12 text-muted-foreground" />
          <h1 className="mt-6 text-2xl font-bold">{o.status === "EXPIRED" ? "Paket sudah kedaluwarsa" : "Pesanan dibatalkan"}</h1>
          <p className="mt-2 text-muted-foreground">Silakan pilih paket eSIM lain jika ingin melanjutkan perjalanan.</p>
          <Link to="/catalog" className={`${btnPrimary} mt-6`}>Lihat paket eSIM</Link>
        </div>
      </Page>
    );
  }

  const esim = o.esim!;
  if (view === "qr") return (
    <Page tabs={false}>
      <button onClick={() => setView("main")} className="flex h-11 items-center text-[16px] text-brand-red">‹ Kembali</button>
      <h1 className="large-title mb-4">QR Code</h1>
      <EsimQr esim={esim} />
      <h2 className="mt-8 mb-2 px-1 text-sm font-medium text-muted-foreground">Pasang manual</h2>
      <ManualDetails esim={esim} />
    </Page>
  );
  if (view === "guide") return (
    <Page tabs={false}>
      <button onClick={() => setView("main")} className="flex h-11 items-center text-[16px] text-brand-red">‹ Kembali</button>
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
        <p className="mt-3 text-lg">{d.flag} {d.nameId}</p>
        <p className="text-muted-foreground">{gbLabel(p.dataGb)} · {p.days} hari</p>
      </div>
      <div className="mt-10 space-y-3">
        <a href={`https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(esim.lpa)}`} className={btnRed}>Pasang eSIM</a>
        <button onClick={() => setView("qr")} className={btnSoft}>Lihat QR Code</button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px] font-medium text-brand-red">
        <button onClick={() => setView("guide")} className="h-11 rounded-xl">Panduan</button>
        <Link to="/my-esim" className="flex h-11 items-center justify-center rounded-xl">Simpan</Link>
        <a href="https://wa.me/" className="flex h-11 items-center justify-center rounded-xl">Support</a>
      </div>
    </Page>
  );
}
