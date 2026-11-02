import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useHomeEsimConfig } from "@/hooks/use-home-esim-config";
import { Headphones, Plus } from "lucide-react";
import { OrderLoading } from "@/components/order-loading";
import { BackBar, Page, SectionTitle, btnSoft, group, row } from "@/components/shell";
import { InstallGuide, ManualDetails } from "@/components/esim-install";
import { DetailSegments, EsimDetailCard, type DetailTab } from "@/components/esim-detail-card";
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
  const { id } = Route.useParams();
  const orders = useOrders();
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");
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
  const isHistory = ["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"].includes(status);
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

      <EsimDetailCard
        summary={`${locationLabel} · ${quotaLabel} · ${durationDays} hari`}
        headline={isHistory ? timeline.headline : packageName}
        hint={timeline.hint}
        statusLabel={ORDER_STATUS_LABEL[status]}
        esim={canInstall && o.esim ? o.esim : null}
        muted={isHistory}
        onManual={() => setDetailTab("guide")}
      />
      <DetailSegments value={detailTab} onChange={setDetailTab} />

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

      {detailTab === "summary" && (
        <>
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
            <TravelTimeline
              timeline={timeline}
              lastSyncedAt={lastSyncedAt}
              syncFailed={syncFailed}
              onRefresh={refreshStatus}
              compact
            />
          </div>
        </>
      )}
      {detailTab === "usage" && (
        <>
          <div className="mt-4">
            <TravelUsageCard view={usage} compact />
          </div>
        </>
      )}
      {detailTab === "guide" && (
        <>
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

          <div className="mt-4">
            <InstallGuide />
          </div>
          {canInstall && o.esim && (
            <div className="mt-4">
              <p className="mb-2 px-1 text-sm font-medium text-muted-foreground">Pasang manual</p>
              <ManualDetails esim={o.esim} iccid />
            </div>
          )}
        </>
      )}

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

      <TravelSupportDialog
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        topics={supportTopics}
        contextFor={supportContextFor}
        supportBaseUrl={SUPPORT_WHATSAPP_URL}
      />
      <Link to="/my-esim" className="sr-only">
        My eSIM
      </Link>
    </Page>
  );
}
