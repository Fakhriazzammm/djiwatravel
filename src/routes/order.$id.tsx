import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  BellRing,
  Check,
  Loader2,
  AlertCircle,
  Printer,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Page, btnPrimary, btnRed, btnSoft } from "@/components/shell";
import { EsimQr, InstallGuide, ManualDetails } from "@/components/esim-install";
import { rupiah } from "@/lib/pricing";
import {
  ensurePaymentLink,
  guestAccessTokenFor,
  hasGuestOrderAccess,
  refreshOrdersFromServer,
  useOrders,
  type Order,
  type OrderStatus,
} from "@/lib/orders";
import { effectiveOrderStatus, ORDER_STATUS_LABEL } from "@/lib/esim-status";
import {
  enableEsimNotifications,
  isWaitingForEsim,
  notificationPermission,
  notificationsSupported,
  notifyEsimReady,
  readNotifyPreference,
  shouldNotifyReady,
  writeNotifyPreference,
} from "@/lib/esim-notify";
import { verifyMayarPayment } from "@/lib/mayar-settlement.server";
import { paymentProgressLabel, type PaymentProgressStage } from "@/lib/payment-progress";
import { SUPPORT_WHATSAPP_URL } from "@/lib/guest-order-access.server";
import { TravelSupportDialog } from "@/components/travel-support-dialog";
import { buildSupportContext, supportTopicsFor } from "@/lib/travel-support";
import { TravelTimeline } from "@/components/travel-timeline";
import { activationTimeline } from "@/lib/travel-journey";

/**
 * Support channel. Kept as one constant so every entry point points at the same place, and so
 * the empty `https://wa.me/` link that went nowhere can be swapped for a real number in one edit.
 */

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
  const [checking, setChecking] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [checkNote, setCheckNote] = useState("");
  const [notifyReady, setNotifyReady] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const current = orders?.find((x) => x.id === id);

  // The customer's choice survives a reload, and counts as on when permission already is.
  useEffect(() => {
    if (!notificationsSupported()) return;
    setNotifyReady(readNotifyPreference() && notificationPermission() === "granted");
  }, []);

  // One settle-on-arrival read, so the activation timeline can state when the status was last
  // confirmed instead of implying freshness from the order creation time.
  useEffect(() => {
    let cancelled = false;
    void refreshOrdersFromServer()
      .then(() => {
        if (!cancelled) setSyncedAt(Date.now());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const [linkBusy, setLinkBusy] = useState(false);
  const [linkStage, setLinkStage] = useState<PaymentProgressStage>("idle");
  const [linkNote, setLinkNote] = useState("");
  const linkAttempted = useRef(false);

  /** Rebuilds the payment link for an order that was created while checkout failed. */
  const buildLink = async () => {
    if (!current) return;
    setLinkBusy(true);
    setLinkStage("preparing");
    setLinkNote("");
    try {
      const url = await ensurePaymentLink(current);
      setLinkNote(url ? "" : "Data kontak pesanan tidak lengkap. Hubungi support ya.");
    } catch {
      setLinkNote("Belum bisa membuat link pembayaran. Coba lagi sebentar lagi.");
    } finally {
      setLinkStage("idle");
      setLinkBusy(false);
    }
  };

  // An order created during a provider hiccup used to be a dead end: try once on its own.
  useEffect(() => {
    if (!current || current.paymentUrl) return;
    if (current.status !== "ORDER_CREATED" || linkAttempted.current) return;
    linkAttempted.current = true;
    void buildLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.status, current?.paymentUrl]);

  const toggleNotify = async () => {
    if (notifyReady) {
      writeNotifyPreference(false);
      setNotifyReady(false);
      return;
    }
    setNotifyBusy(true);
    try {
      const enabled = await enableEsimNotifications();
      writeNotifyPreference(enabled);
      setNotifyReady(enabled);
    } finally {
      setNotifyBusy(false);
    }
  };
  const awaitingPayment =
    current?.status === "ORDER_CREATED" || current?.status === "WAITING_PAYMENT";

  const checkPayment = async (auto: boolean) => {
    const token = guestAccessTokenFor(id);
    if (!token) return false;
    if (!auto) {
      setChecking(true);
      setCheckNote("");
    }
    try {
      const result = await verifyMayarPayment({ data: { orderId: id, accessToken: token } });
      await refreshOrdersFromServer();
      if (!auto)
        setCheckNote(
          result.settled
            ? "Pembayaran terverifikasi. eSIM sedang disiapkan…"
            : "Pembayaran belum kami terima. Selesaikan dulu pembayarannya, lalu cek lagi.",
        );
      return result.settled;
    } catch {
      if (!auto) setCheckNote("Belum bisa memeriksa pembayaran. Coba lagi sebentar lagi.");
      return false;
    } finally {
      if (!auto) setChecking(false);
    }
  };

  // Coming back from Mayar: verify server-side and refresh, then keep watching
  // for a short while so a paid order turns into an eSIM without a manual reload.
  useEffect(() => {
    if (!awaitingPayment) return;
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    const run = async () => {
      attempts += 1;
      const settled = await checkPayment(true);
      if (cancelled || settled) return;
      if (attempts < 12) timer = window.setTimeout(() => void run(), 7000);
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingPayment, id]);

  // PAID/PROVISIONING used to be a dead end until the customer reloaded by hand.
  useEffect(() => {
    if (!current || !isWaitingForEsim(current.status)) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      await refreshOrdersFromServer();
      if (!cancelled) timer = window.setTimeout(() => void tick(), 8000);
    };
    timer = window.setTimeout(() => void tick(), 8000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.status, id]);

  // Fire once, at the moment the order becomes usable.
  const previousStatus = useRef<OrderStatus | null>(null);
  useEffect(() => {
    const status = current?.status ?? null;
    const previous = previousStatus.current;
    previousStatus.current = status;
    if (!status || !notifyReady) return;
    if (!shouldNotifyReady(previous, status)) return;
    void notifyEsimReady(current?.packageName ?? current?.packageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.status, notifyReady]);

  if (!orders)
    return (
      <Page>
        <div className="mt-20 h-40 animate-pulse rounded-2xl bg-secondary" />
      </Page>
    );
  const o = hasGuestOrderAccess(id) ? orders.find((x) => x.id === id) : undefined;
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
      <Page>
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
        <OrderTimeline status={o.status} expiresAt={o.expiresAt} />
        <div className="mt-4 rounded-2xl border border-border p-4 text-center">
          <p className="font-semibold">
            {o.paymentUrl ? "Menunggu pembayaran" : "Menyiapkan tagihan pembayaran"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {o.paymentUrl
              ? "Setelah membayar, kamu otomatis kembali ke halaman ini dan eSIM langsung muncul."
              : "Tagihan pembayaran belum terbentuk. Tekan tombol di bawah untuk membuatnya."}
          </p>
          {o.paymentUrl ? (
            <a
              href={o.paymentUrl}
              target="_blank"
              rel="noreferrer"
              className={`${btnRed} mt-4 block`}
            >
              Lanjutkan pembayaran
            </a>
          ) : (
            <button
              type="button"
              disabled={linkBusy}
              onClick={() => void buildLink()}
              className={`${btnRed} mt-4 block w-full disabled:opacity-50`}
            >
              {linkBusy ? paymentProgressLabel(linkStage) : "Buat link pembayaran"}
            </button>
          )}
          {linkNote && <p className="mt-2 text-xs text-destructive">{linkNote}</p>}
          <button
            type="button"
            disabled={checking}
            onClick={() => void checkPayment(false)}
            className={`${btnSoft} mt-3 inline-flex items-center justify-center gap-2 disabled:opacity-50`}
          >
            <RefreshCw className={checking ? "size-4 animate-spin" : "size-4"} />
            {checking ? "Memeriksa…" : "Saya sudah bayar, cek status"}
          </button>
          {checkNote && <p className="mt-2 text-xs text-muted-foreground">{checkNote}</p>}
        </div>
        <InvoiceCard order={o} />
        <Link
          to="/receipt/$id"
          params={{ id: o.id }}
          className="mt-5 block text-center text-sm font-semibold text-brand-red"
        >
          Lihat struk pembayaran
        </Link>
        <Link to="/explore" className="mt-3 block text-center text-sm font-semibold text-primary">
          Kembali ke Explore
        </Link>
      </Page>
    );
  }

  if (o.status === "PAID" || o.status === "PROVISIONING") {
    return (
      <Page tabs={false}>
        <OrderTimeline status={o.status} expiresAt={o.expiresAt} />
        <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
          <Loader2 className="size-10 animate-spin text-brand-red" />
          <h1 className="mt-6 text-2xl font-bold">Pembayaran diterima</h1>
          <p className="mt-2 text-muted-foreground">Sedang menyiapkan eSIM kamu…</p>
        </div>
        <TravelTimeline
          timeline={activationTimeline(o.status)}
          lastSyncedAt={syncedAt}
          onRefresh={async () => {
            await refreshOrdersFromServer();
            setSyncedAt(Date.now());
          }}
        />
        {notificationsSupported() && (
          <button
            type="button"
            onClick={() => void toggleNotify()}
            disabled={notifyBusy}
            className="tap mx-auto flex min-h-11 items-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold disabled:opacity-50"
          >
            {notifyReady ? <BellRing className="size-4" /> : <Bell className="size-4" />}
            {notifyBusy
              ? "Mengaktifkan…"
              : notifyReady
                ? "Notifikasi aktif — kami kabari saat siap"
                : "Beri tahu saya saat eSIM siap"}
          </button>
        )}
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Halaman ini memperbarui sendiri, jadi kamu tidak perlu menekan apa pun.
        </p>
      </Page>
    );
  }

  if (o.status === "PROVISIONING_FAILED" || o.status === "REFUNDED") {
    return (
      <Page tabs={false}>
        <OrderTimeline status={o.status} expiresAt={o.expiresAt} />
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
            Pembayaran tetap tercatat. Hubungi support agar kami meninjau pesanan.
          </p>
        )}
        <button type="button" onClick={() => setSupportOpen(true)} className={`${btnSoft} mt-3`}>
          Hubungi Support
        </button>
        <TravelSupportDialog
          open={supportOpen}
          onClose={() => setSupportOpen(false)}
          topics={supportTopicsFor(o.status)}
          contextFor={(topic) =>
            buildSupportContext({
              topic,
              status: o.status,
              orderId: o.id,
              orderCode: o.publicOrderCode ?? null,
              packageName,
              destination: locationLabel,
              iccid: o.esim?.iccid ?? null,
              lastSyncedAt: null,
            })
          }
          supportBaseUrl={SUPPORT_WHATSAPP_URL}
        />
      </Page>
    );
  }

  if (o.status === "CANCELLED" || o.status === "EXPIRED") {
    return (
      <Page tabs={false}>
        <OrderTimeline status={o.status} expiresAt={o.expiresAt} />
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <AlertCircle className="size-12 text-muted-foreground" />
          <h1 className="mt-6 text-2xl font-bold">
            {o.status === "EXPIRED" ? "Paket sudah kedaluwarsa" : "Pesanan dibatalkan"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Silakan pilih paket eSIM lain jika ingin melanjutkan perjalanan.
          </p>
          <Link to="/checkout/$id" params={{ id: o.packageId }} className={`${btnRed} mt-6`}>
            Beli lagi paket ini
          </Link>
          <Link to="/explore" className={`${btnSoft} mt-2`}>
            Lihat paket eSIM lain
          </Link>
        </div>
      </Page>
    );
  }

  const esim = o.esim!;
  if (view === "qr")
    return (
      <Page>
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
      <Page>
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
      <OrderTimeline status={o.status} expiresAt={o.expiresAt} />
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
      <div className="mt-8">
        <TravelTimeline
          timeline={activationTimeline(o.status)}
          lastSyncedAt={syncedAt}
          onRefresh={async () => {
            await refreshOrdersFromServer();
            setSyncedAt(Date.now());
          }}
        />
      </div>
      <div className="mt-8 space-y-3">
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
      <div className="mt-4 grid grid-cols-2 gap-2 text-center text-[12px] font-medium text-brand-red">
        <button onClick={() => setView("guide")} className="h-11 rounded-xl">
          Panduan
        </button>
        <Link to="/my-esim" className="flex h-11 items-center justify-center rounded-xl">
          Simpan
        </Link>
      </div>
      <Link
        to="/receipt/$id"
        params={{ id: o.id }}
        className={`${btnRed} mt-3 inline-flex items-center justify-center gap-2`}
      >
        <Receipt className="size-4" aria-hidden="true" />
        Struk &amp; panduan pasang
      </Link>
      <Link to="/checkout/$id" params={{ id: o.packageId }} className={`${btnSoft} mt-3`}>
        Beli lagi paket ini
      </Link>
      <a
        href={SUPPORT_WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block text-center text-[12px] font-medium text-brand-red"
      >
        Butuh bantuan? Hubungi support
      </a>
      <InvoiceCard order={o} />
    </Page>
  );
}

const TIMELINE_STEPS: OrderStatus[] = ["ORDER_CREATED", "PAID", "PROVISIONING", "READY"];

function OrderTimeline({
  status,
  expiresAt,
}: {
  status: OrderStatus;
  expiresAt: number | undefined;
}) {
  const effective = effectiveOrderStatus(status, expiresAt);
  const terminal = ["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"].includes(effective);
  const currentIndex =
    effective === "INSTALLED"
      ? 3
      : effective === "WAITING_PAYMENT"
        ? 0
        : TIMELINE_STEPS.indexOf(effective);
  return (
    <section
      aria-label="Tahapan pesanan"
      className="mt-5 rounded-2xl border border-border bg-surface p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Status pesanan
      </p>
      {terminal ? (
        <p className="mt-2 text-sm font-semibold">{ORDER_STATUS_LABEL[effective]}</p>
      ) : (
        <ol className="mt-3 grid grid-cols-4 gap-1">
          {TIMELINE_STEPS.map((step, index) => {
            const done = index <= currentIndex;
            return (
              <li key={step} className="text-center text-[11px] leading-tight">
                <span
                  className={`mx-auto flex size-6 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-brand-red text-white" : "bg-secondary text-muted-foreground"}`}
                >
                  {index + 1}
                </span>
                <span
                  className={`mt-1 block ${done ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                >
                  {step === "ORDER_CREATED"
                    ? "Dibuat"
                    : step === "PAID"
                      ? "Dibayar"
                      : step === "PROVISIONING"
                        ? "Disiapkan"
                        : "Siap"}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{ORDER_STATUS_LABEL[effective]}</p>
    </section>
  );
}

/** Printable receipt for a guest or member order (browser print / save as PDF). */
function InvoiceCard({ order }: { order: Order }) {
  return (
    <section className="invoice-card mt-6 rounded-2xl bg-surface p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Invoice
          </p>
          <p className="mt-1 font-semibold">Djiwa Travel</p>
          <p className="text-muted-foreground">#{order.publicOrderCode ?? order.id.slice(0, 8)}</p>
        </div>
        <Link
          to="/receipt/$id"
          params={{ id: order.id }}
          className="print-hide flex min-h-10 items-center gap-2 rounded-xl bg-secondary px-3 font-semibold"
          aria-label="Buka struk untuk diunduh sebagai PDF"
        >
          <Receipt className="size-4" /> Struk
        </Link>
      </div>
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-2 border-t pt-3">
        <dt className="text-muted-foreground">Produk</dt>
        <dd className="text-right font-medium">{order.packageName ?? order.packageId}</dd>
        <dt className="text-muted-foreground">Pembayaran</dt>
        <dd className="text-right font-medium uppercase">{order.method}</dd>
        <dt className="text-muted-foreground">Total</dt>
        <dd className="text-right font-semibold">{rupiah(order.amount)}</dd>
      </dl>
    </section>
  );
}
