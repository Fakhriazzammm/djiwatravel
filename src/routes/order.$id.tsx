import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Printer, Receipt, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Page, btnPrimary, btnRed, btnSoft } from "@/components/shell";
import { EsimInstallPanel, InstallGuide, ManualDetails } from "@/components/esim-install";
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
import { effectiveOrderStatus } from "@/lib/esim-status";
import {
  enableEsimNotifications,
  isWaitingForEsim,
  notificationPermission,
  notificationsSupported,
  notifyEsimReady,
  readNotifyPreference,
  syncNotifyPreferenceFromServer,
  shouldNotifyReady,
  writeNotifyPreference,
} from "@/lib/esim-notify";
import { verifyMayarPayment } from "@/lib/mayar-settlement.fn";
import { chargeTravelOrderWithDjiwaPay } from "@/lib/djiwa-pay-payment.fn";
import { paymentProgressLabel, type PaymentProgressStage } from "@/lib/payment-progress";
import { SUPPORT_WHATSAPP_URL } from "@/lib/support-contact";
import { TravelSupportDialog } from "@/components/travel-support-dialog";
import { buildSupportContext, supportTopicsFor } from "@/lib/travel-support";
import { EsimPreparingView } from "@/components/esim-preparing-view";
import { OrderOutcomeCard } from "@/components/order-outcome-card";
import { EsimDetailCard } from "@/components/esim-detail-card";
import { EsimStatusCard, statusPrimary, statusSecondary } from "@/components/esim-status-card";
import { snapshotAgeLabel } from "@/lib/offline-travel-snapshot";
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
    let live = true;
    void syncNotifyPreferenceFromServer().then((enabled) => {
      if (live && enabled !== null)
        setNotifyReady(enabled && notificationPermission() === "granted");
    });
    return () => {
      live = false;
    };
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
    if (!current || current.method === "djiwa_pay") return;
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
    if (!current || current.paymentUrl || current.method === "djiwa_pay") return;
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
    if (current?.method === "djiwa_pay") {
      if (!auto) {
        setChecking(true);
        setCheckNote("");
      }
      try {
        const result = await chargeTravelOrderWithDjiwaPay({ data: { orderId: id } });
        await refreshOrdersFromServer();
        if (!auto) {
          setCheckNote(
            result.status === "paid"
              ? "Pembayaran Djiwa Pay terkonfirmasi. eSIM sedang disiapkan…"
              : result.status === "insufficient_balance"
                ? "Saldo Djiwa Pay belum mencukupi. Isi saldo lalu coba lagi."
                : result.status === "wallet_blocked"
                  ? "Saldo Djiwa Pay belum dapat digunakan. Hubungi support untuk bantuan."
                  : "Status pembayaran masih diperiksa. Coba cek lagi sebentar lagi.",
          );
        }
        return result.status === "paid";
      } catch {
        if (!auto) setCheckNote("Belum bisa memeriksa saldo Djiwa Pay. Coba lagi nanti.");
        return false;
      } finally {
        if (!auto) setChecking(false);
      }
    }
    // Account orders verify through the signed-in session; legacy guest orders send their token.
    const token = guestAccessTokenFor(id);
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
    if (!awaitingPayment || current?.method === "djiwa_pay") return;
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
  }, [awaitingPayment, current?.method, id]);

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
  const found = orders.find((x) => x.id === id);
  const o =
    found && (hasGuestOrderAccess(id) || found.fromMemberAccount === true) ? found : undefined;
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
        <div className="pt-3">
          <EsimStatusCard
            status={o.status}
            summary={`${locationLabel} · ${quotaLabel} · ${durationLabel}`}
            headline={packageName}
            hint={`Total ${rupiah(o.amount)}. Selesaikan pembayaran, eSIM diproses otomatis setelahnya.${o.publicOrderCode ? ` Kode: ${o.publicOrderCode}` : ""}`}
            timeline={activationTimeline(o.status)}
          />
        </div>
        <div className="mt-3 rounded-3xl bg-surface p-4 text-center">
          {o.method === "djiwa_pay" ? (
            <>
              <p className="font-semibold">
                {o.status === "ORDER_CREATED"
                  ? "Bayar dengan saldo Djiwa Pay"
                  : "Memastikan pembayaran Djiwa Pay"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {o.status === "ORDER_CREATED"
                  ? "Belum ada debit yang terkonfirmasi. Pastikan saldo mencukupi, lalu coba lagi."
                  : "Jika respons sebelumnya terputus, pemeriksaan ini mengulang permintaan dengan aman."}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link to="/wallet" className={`${btnSoft} flex-1`}>
                  Isi saldo Djiwa Pay
                </Link>
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => void checkPayment(false)}
                  className={`${btnRed} flex-1 disabled:opacity-50`}
                >
                  {checking
                    ? "Memeriksa…"
                    : o.status === "ORDER_CREATED"
                      ? "Bayar lagi"
                      : "Cek pembayaran"}
                </button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
          {checkNote && <p className="mt-2 text-xs text-muted-foreground">{checkNote}</p>}
        </div>
        {o.method !== "djiwa_pay" && <InvoiceCard order={o} />}
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
        <EsimPreparingView
          order={o}
          packageLine={`${locationLabel} · ${quotaLabel} · ${durationLabel}`}
          lastSyncedAt={syncedAt}
          onRefresh={async () => {
            await refreshOrdersFromServer();
            setSyncedAt(Date.now());
          }}
          notifySupported={notificationsSupported()}
          notifyReady={notifyReady}
          notifyBusy={notifyBusy}
          onToggleNotify={() => void toggleNotify()}
        />
      </Page>
    );
  }

  if (o.status === "PROVISIONING_FAILED" || o.status === "REFUNDED") {
    const refunded = o.status === "REFUNDED";
    return (
      <Page tabs={false}>
        <OrderOutcomeCard
          status={o.status}
          summary={`${locationLabel} · ${quotaLabel} · ${durationLabel}`}
          headline={refunded ? "Dana dikembalikan" : "eSIM belum berhasil dibuat"}
          hint={
            refunded
              ? "Pengembalian dana diproses sesuai kebijakan kami."
              : "Pembayaran tetap tercatat. Hubungi support agar kami meninjau pesanan."
          }
          timeline={activationTimeline(o.status)}
        >
          <button type="button" onClick={() => setSupportOpen(true)} className={statusPrimary}>
            Hubungi Support
          </button>
          <Link to="/receipt/$id" params={{ id: o.id }} className={statusSecondary}>
            Lihat struk
          </Link>
        </OrderOutcomeCard>
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
        <OrderOutcomeCard
          status={o.status}
          summary={`${locationLabel} · ${quotaLabel} · ${durationLabel}`}
          headline={o.status === "EXPIRED" ? "Paket sudah kedaluwarsa" : "Pesanan dibatalkan"}
          hint="Pilih paket eSIM lain jika ingin melanjutkan perjalanan."
        >
          <Link to="/checkout/$id" params={{ id: o.packageId }} className={statusPrimary}>
            Beli lagi
          </Link>
          <Link to="/explore" className={statusSecondary}>
            Paket lain
          </Link>
        </OrderOutcomeCard>
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
        <EsimInstallPanel esim={esim} />
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
      <div className="space-y-3">
        <EsimDetailCard
          status={effectiveOrderStatus(o.status, o.expiresAt)}
          summary={`${locationLabel} · ${quotaLabel} · ${durationLabel}`}
          headline="eSIM kamu siap!"
          hint={`${packageName}. Pasang sebelum berangkat, butuh Wi-Fi, cukup sekali.`}
          esim={esim}
          timeline={activationTimeline(o.status)}
          onManual={() => setView("guide")}
        />
        <p className="text-center text-xs text-muted-foreground">
          Terakhir diperbarui{" "}
          {typeof syncedAt === "number" ? snapshotAgeLabel(syncedAt) : "saat halaman dibuka"} ·{" "}
          <button
            type="button"
            className="font-semibold text-foreground underline"
            onClick={async () => {
              await refreshOrdersFromServer();
              setSyncedAt(Date.now());
            }}
          >
            Perbarui status
          </button>
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <Link to="/receipt/$id" params={{ id: o.id }} className={statusPrimary}>
          <Receipt className="mr-1.5 size-4" aria-hidden="true" />
          Struk &amp; panduan
        </Link>
        <button type="button" onClick={() => setView("qr")} className={statusSecondary}>
          QR layar penuh
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 text-center text-[12px] font-medium text-brand-red">
        <button type="button" onClick={() => setView("guide")} className="h-10 rounded-xl">
          Panduan
        </button>
        <Link to="/my-esim" className="flex h-10 items-center justify-center rounded-xl">
          Simpan
        </Link>
        <Link
          to="/checkout/$id"
          params={{ id: o.packageId }}
          className="flex h-10 items-center justify-center rounded-xl"
        >
          Beli lagi
        </Link>
      </div>
      <a
        href={SUPPORT_WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block text-center text-[12px] font-medium text-brand-red"
      >
        Butuh bantuan? Hubungi support
      </a>
      <InvoiceCard order={o} />
    </Page>
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
