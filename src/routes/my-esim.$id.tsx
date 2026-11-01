import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useHomeEsimConfig } from "@/hooks/use-home-esim-config";
import { ChevronDown, Globe2, Headphones, Info, Plus, QrCode } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { QuotaRing } from "@/components/esim-quota-ring";
import { EsimStatusBadge } from "@/components/esim-status-badge";
import { OrderLoading } from "@/components/order-loading";
import { destinationArt } from "@/lib/destination-art";
import { springIos } from "@/lib/motion";
import {
  BackBar,
  Page,
  SectionTitle,
  StickyCta,
  btnRed,
  btnSoft,
  group,
  row,
} from "@/components/shell";
import { EsimInstallPanel, ManualDetails } from "@/components/esim-install";
import { hasGuestOrderAccess, refreshOrdersFromServer, useOrders } from "@/lib/orders";
import { SUPPORT_WHATSAPP_URL } from "@/lib/support-contact";
import { effectiveOrderStatus, ORDER_STATUS_LABEL } from "@/lib/esim-status";
import { TravelTimeline } from "@/components/travel-timeline";
import { TravelChecklist } from "@/components/travel-checklist";
import { TravelUsageCard } from "@/components/travel-usage-card";
import { TravelSupportDialog } from "@/components/travel-support-dialog";
import { OfflineSnapshotBanner } from "@/components/offline-snapshot-banner";
import {
  readTripPlan,
  setChecklistItem,
  TRIP_PLANS_EVENT,
  writeDepartureDate,
} from "@/lib/travel-checklist-store";
import {
  buildTravelSnapshot,
  clearTravelSnapshot,
  isSnapshotStale,
  readTravelSnapshot,
  writeTravelSnapshot,
  type TravelSnapshot,
} from "@/lib/offline-travel-snapshot";
import {
  activationTimeline,
  buildTravelChecklist,
  calendarDaysUntil,
  checklistProgress,
  formatData,
  formatGb,
  formatRemainingPercent,
  parseDepartureDate,
  reorderIntent,
  usageView,
} from "@/lib/travel-journey";
import { buildSupportContext, supportTopicsFor } from "@/lib/travel-support";

/** Support channel; single place to swap in a real number. */

export const Route = createFileRoute("/my-esim/$id")({
  head: () => ({
    meta: [
      { title: "Detail eSIM — Djiwa Travel" },
      { name: "description", content: "Kuota, masa berlaku, dan cara pasang eSIM-mu." },
      { property: "og:title", content: "Detail eSIM — Djiwa Travel" },
      { property: "og:description", content: "Kuota, masa berlaku, dan cara pasang eSIM-mu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Detail,
});

function Detail() {
  const homeConfig = useHomeEsimConfig();
  const reduce = useReducedMotion();
  const [artFailed, setArtFailed] = useState(false);
  const { id } = Route.useParams();
  const orders = useOrders();
  const [tab, setTab] = useState<"none" | "install" | "topup">("none");
  const [tech, setTech] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [trip, setTrip] = useState(() => readTripPlan(id));
  const [snapshot, setSnapshot] = useState<TravelSnapshot | null>(() => readTravelSnapshot(id));
  const [supportOpen, setSupportOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const o = orders?.find(
    (x) => x.id === id && (x.fromMemberAccount === true || hasGuestOrderAccess(id)),
  );

  // The route parameter can change without remounting, so re-read the device-scoped data.
  useEffect(() => {
    setTrip(readTripPlan(id));
    setSnapshot(readTravelSnapshot(id));
    // The account copy can arrive after first paint (another device edited it).
    const onPlans = () => setTrip(readTripPlan(id));
    window.addEventListener(TRIP_PLANS_EVENT, onPlans);
    return () => window.removeEventListener(TRIP_PLANS_EVENT, onPlans);
  }, [id]);

  /**
   * Keeps the offline copy in step with the last authorized read. Written only after the
   * order was actually available, so a failed read never overwrites a good snapshot.
   */
  useEffect(() => {
    if (!o) return;
    const next = buildTravelSnapshot(o);
    if (writeTravelSnapshot(next)) setSnapshot(next);
    setLastSyncedAt(next.savedAt);
  }, [o]);

  const refreshStatus = async () => {
    setSyncFailed(false);
    try {
      await refreshOrdersFromServer();
      setLastSyncedAt(Date.now());
    } catch {
      setSyncFailed(true);
    }
  };
  if (!orders)
    return (
      <Page>
        <BackBar title="Detail eSIM" />
        <OrderLoading label="Memuat eSIM…" />
      </Page>
    );
  if (!o)
    return (
      <Page>
        <BackBar />
        <p className="mt-10 text-center text-muted-foreground">eSIM tidak ditemukan.</p>
      </Page>
    );
  const status = effectiveOrderStatus(o.status, o.expiresAt);
  const isReady = status === "READY";
  const isHistory = ["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"].includes(status);
  const art = destinationArt(o.locationCodes?.[0]);
  const canInstall = Boolean(o.esim) && (status === "READY" || status === "INSTALLED");
  const packageName = o.packageName ?? o.packageId;
  const locationLabel = o.locationCodes?.join(", ") || "Regional";
  const durationDays = o.durationDays ?? 0;
  const quotaLabel =
    o.unlimited === true
      ? "Unlimited"
      : o.volumeBytes != null && o.volumeBytes > 0
        ? `${(o.volumeBytes / 1_000_000_000).toFixed(1)} GB`
        : "Kuota belum tersedia";
  const timeline = activationTimeline(status);
  const usage = usageView({
    volumeBytes: o.usageVolumeBytes ?? o.volumeBytes ?? null,
    usedGb: o.usedGb ?? null,
    measuredAt: o.usageMeasuredAt ?? null,
    unlimited: o.unlimited === true,
    active: canInstall,
    lowPercent: homeConfig.lowQuotaPercent,
  });
  const checklist = buildTravelChecklist({
    departureDate: trip.departureDate,
    completed: trip.completed,
  });
  const progress = checklistProgress(checklist);
  const departureAt = parseDepartureDate(trip.departureDate);
  const daysUntil = departureAt === null ? null : calendarDaysUntil(departureAt);
  const reorder = reorderIntent({
    packageId: o.packageId,
    status,
    locationCodes: o.locationCodes,
  });
  const supportTopics = supportTopicsFor(status, { quotaLow: usage.low, hasQr: Boolean(o.esim) });
  const supportContextFor = (topic: (typeof supportTopics)[number]) =>
    buildSupportContext({
      topic,
      status,
      orderId: o.id,
      orderCode: o.publicOrderCode ?? null,
      packageName,
      destination: locationLabel,
      iccid: o.esim?.iccid ?? null,
      lastSyncedAt,
    });
  const exp = new Date(o.createdAt + durationDays * 864e5).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
  });

  return (
    <Page>
      <BackBar title="Detail eSIM" />

      <motion.section
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : springIos}
        className={`overflow-hidden rounded-[28px] border border-border/60 p-5 shadow-[0_14px_32px_-24px_rgba(0,0,0,0.35)] ${
          isHistory ? "bg-surface" : art.tint
        }`}
      >
        <div className="flex items-start gap-4">
          <span
            className={`grid size-20 shrink-0 place-items-center rounded-3xl bg-white/70 ${isHistory ? "opacity-60 grayscale" : ""}`}
          >
            {art.src && !artFailed ? (
              <motion.img
                src={art.src}
                alt=""
                width={64}
                height={64}
                decoding="async"
                onError={() => setArtFailed(true)}
                className="size-16 object-contain"
                initial={reduce ? false : { scale: 0.8, rotate: -6, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={reduce ? { duration: 0 } : { ...springIos, delay: 0.1 }}
              />
            ) : (
              <Globe2 className="size-9 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              eSIM kamu
            </p>
            <h1 className="mt-1 text-[22px] font-bold leading-tight">{packageName}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {locationLabel} · {quotaLabel} · {durationDays} hari
            </p>
            <div className="mt-2">
              <EsimStatusBadge status={status} low={usage.kind === "measured" && usage.low} />
            </div>
          </div>
        </div>
        {usage.kind === "measured" &&
        usage.remainingPercent !== null &&
        usage.remainingBytes !== null ? (
          <div className="mt-4 flex items-center gap-4 rounded-2xl bg-white/70 p-3">
            <QuotaRing
              percent={usage.remainingPercent}
              label={formatRemainingPercent(usage)}
              valueText={`Sisa ${formatData(usage.remainingBytes)} (${formatRemainingPercent(usage)})`}
              low={usage.low}
              size={60}
            />
            <div className="min-w-0">
              <p className="text-[17px] font-bold">{formatData(usage.remainingBytes)} tersisa</p>
              {usage.totalBytes !== null && (
                <p className="text-[12px] text-muted-foreground">
                  dari {formatGb(usage.totalBytes)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-white/70 p-3 text-[13px] text-muted-foreground">
            {isReady
              ? "Sudah siap dipasang di perangkatmu."
              : isHistory
                ? timeline.hint
                : "Kami akan memperbarui status secara otomatis."}
          </p>
        )}
      </motion.section>

      {status === "PROVISIONING_FAILED" && (
        <div className="mt-4 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-4">
          <p className="font-semibold">Pemrosesan belum berhasil</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pembayaran tetap tercatat. Hubungi support agar kami meninjau pesanan tanpa membuat
            order ganda.
          </p>
        </div>
      )}
      {actionMessage && (
        <p className="mt-3 text-center text-sm text-muted-foreground">{actionMessage}</p>
      )}

      {canInstall && o.esim && (
        <section className="mt-3 rounded-2xl border border-brand-red/15 bg-brand-red-soft/45 p-3">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-red text-white">
              <QrCode className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold">Pasang eSIM sekarang</h2>
              <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                Scan QR sebelum berangkat saat perangkat terhubung ke Wi-Fi.
              </p>
            </div>
          </div>
          {tab !== "install" ? (
            <button type="button" onClick={() => setTab("install")} className={`${btnRed} mt-4`}>
              <QrCode className="size-5" aria-hidden="true" /> Tampilkan QR Code
            </button>
          ) : (
            <div className="mt-4">
              <EsimInstallPanel esim={o.esim} compact withGuide />
            </div>
          )}
        </section>
      )}

      <section className="mt-3 rounded-2xl bg-surface p-3">
        <div className="mb-2 [&_h2]:text-[16px]">
          <SectionTitle>Ringkasan paket</SectionTitle>
        </div>
        <div className={group}>
          {[
            ["Paket", `${quotaLabel} · ${durationDays} hari`],
            ...(canInstall ? [["Berlaku sampai", `±${exp}`]] : []),
            ["Destinasi", locationLabel],
            ["Status", ORDER_STATUS_LABEL[status]],
          ].map(([k, v]) => (
            <div key={k} className={row}>
              <span className="text-[14px] text-muted-foreground">{k}</span>
              <span className="truncate text-right text-[14px] font-medium">{v}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4">
        <TravelUsageCard view={usage} compact />
      </div>

      <div className="mt-4">
        <TravelTimeline
          timeline={timeline}
          lastSyncedAt={lastSyncedAt}
          syncFailed={syncFailed}
          onRefresh={refreshStatus}
          compact
        />
      </div>

      <div className="mt-4">
        <TravelChecklist
          items={checklist}
          departureDate={trip.departureDate}
          daysUntil={daysUntil}
          progress={progress}
          onSetDepartureDate={(value) => setTrip(writeDepartureDate(id, value))}
          onToggle={(key, done) => setTrip(setChecklistItem(id, key, done))}
          compact
        />
      </div>

      <OfflineSnapshotBanner
        snapshot={snapshot}
        stale={snapshot ? isSnapshotStale(snapshot) : false}
        onClear={() => {
          clearTravelSnapshot(id);
          setSnapshot(null);
        }}
      />

      <section className="mt-4 rounded-2xl bg-surface p-4">
        <SectionTitle>Butuh bantuan?</SectionTitle>
        <button
          type="button"
          onClick={() => setSupportOpen(true)}
          className={`${btnSoft} justify-between px-4`}
        >
          <span className="flex items-center gap-2">
            <Headphones className="size-4" aria-hidden="true" /> Chat dengan support
          </span>
          <span aria-hidden="true">›</span>
        </button>
      </section>

      <div className="mt-4">
        <Link to={reorder.href} params={{ id: reorder.packageId }} className={btnSoft}>
          <Plus className="size-4" aria-hidden="true" /> {reorder.label}
        </Link>
        {reorder.fallbackDestinationCode && (
          <Link
            to="/destination/$code"
            params={{ code: reorder.fallbackDestinationCode }}
            className={`${btnSoft} mt-2 text-center`}
          >
            Lihat paket lain untuk {reorder.fallbackDestinationCode}
          </Link>
        )}
        <p className="mt-2 text-center text-[12px] text-muted-foreground">
          Harga dan ketersediaan dicek ulang saat checkout.
        </p>
      </div>

      <button
        onClick={() => setTech(!tech)}
        aria-expanded={tech}
        className="tap mt-4 flex min-h-11 w-full items-center justify-between rounded-2xl bg-surface px-4 text-[14px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <Info className="size-4" /> Detail teknis
        </span>
        <ChevronDown className={`size-4 transition ${tech ? "rotate-180" : ""}`} />
      </button>
      {tech && o.esim && (
        <div className="mt-3">
          <ManualDetails esim={o.esim} iccid />
        </div>
      )}
      <TravelSupportDialog
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        topics={supportTopics}
        contextFor={supportContextFor}
        supportBaseUrl={SUPPORT_WHATSAPP_URL}
      />
      {canInstall && (
        <StickyCta compact>
          <button type="button" onClick={() => setTab("install")} className={btnRed}>
            <QrCode className="size-5" aria-hidden="true" />
            {tab === "install" ? "QR Code tampil di atas" : "Pasang eSIM sekarang"}
          </button>
        </StickyCta>
      )}
      <Link to="/my-esim" className="sr-only">
        My eSIM
      </Link>
    </Page>
  );
}
