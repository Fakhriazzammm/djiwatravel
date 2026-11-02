import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useHomeEsimConfig } from "@/hooks/use-home-esim-config";
import { Headphones, Plus } from "lucide-react";
import { OrderLoading } from "@/components/order-loading";
import { statusPrimary, statusSecondary } from "@/components/esim-status-card";
import { BackBar, Page, btnSoft, group, row } from "@/components/shell";
import { InstallGuide, ManualDetails } from "@/components/esim-install";
import { DetailSegments, EsimDetailCard, type DetailTab } from "@/components/esim-detail-card";
import { hasGuestOrderAccess, refreshOrdersFromServer, useOrders } from "@/lib/orders";
import { SUPPORT_WHATSAPP_URL } from "@/lib/support-contact";
import { effectiveOrderStatus, ORDER_STATUS_LABEL } from "@/lib/esim-status";
import { snapshotAgeLabel } from "@/lib/offline-travel-snapshot";
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
  formatData,
  calendarDaysUntil,
  checklistProgress,
  parseDepartureDate,
  reorderIntent,
  usageView,
} from "@/lib/travel-journey";
import { buildSupportContext, supportTopicsFor } from "@/lib/travel-support";
import { locationCodesLabel } from "@/lib/package-copy";

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
  const locationLabel = locationCodesLabel(o.locationCodes);
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

  const activeStat =
    status === "INSTALLED" && usage.kind === "measured" && usage.remainingBytes !== null
      ? { value: formatData(usage.remainingBytes), caption: "tersisa" }
      : null;
  const cardActions =
    status === "PROVISIONING_FAILED" ? (
      <>
        <button type="button" onClick={() => setSupportOpen(true)} className={statusPrimary}>
          Hubungi support
        </button>
        <Link to="/receipt/$id" params={{ id: o.id }} className={statusSecondary}>
          Lihat struk
        </Link>
      </>
    ) : isHistory ? (
      <>
        <Link to={reorder.href} params={{ id: reorder.packageId }} className={statusPrimary}>
          {reorder.label}
        </Link>
        <Link to="/receipt/$id" params={{ id: o.id }} className={statusSecondary}>
          Lihat struk
        </Link>
      </>
    ) : status === "PAID" || status === "PROVISIONING" ? (
      <button type="button" onClick={() => void refreshStatus()} className={statusPrimary}>
        Perbarui status
      </button>
    ) : (
      <>
        <Link to="/order/$id" params={{ id: o.id }} className={statusPrimary}>
          Lanjut bayar
        </Link>
        <Link to="/receipt/$id" params={{ id: o.id }} className={statusSecondary}>
          Lihat struk
        </Link>
      </>
    );

  return (
    <Page>
      <BackBar title="Detail eSIM" />

      <EsimDetailCard
        status={status}
        summary={locationLabel}
        headline={packageName}
        hint={timeline.hint}
        esim={canInstall && o.esim ? o.esim : null}
        timeline={timeline}
        stat={activeStat}
        onManual={() => setDetailTab("guide")}
      >
        {cardActions}
      </EsimDetailCard>

      <div className="mt-2.5 flex rounded-3xl bg-surface py-2.5" data-testid="esim-detail-stats">
        {[
          ["Paket", quotaLabel],
          ["Durasi", `${durationDays} hari`],
          ...(canInstall ? [["Berlaku", `±${exp}`]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex-1 border-r border-border text-center last:border-r-0">
            <small className="block text-[11px] text-muted-foreground">{k}</small>
            <b className="text-[14px]">{v}</b>
          </div>
        ))}
      </div>

      <DetailSegments value={detailTab} onChange={setDetailTab} />

      {actionMessage && (
        <p className="mb-2 text-center text-sm text-muted-foreground">{actionMessage}</p>
      )}

      {detailTab === "summary" && (
        <section className="rounded-3xl bg-surface px-4 py-1">
          <div className={group}>
            {[
              ["Destinasi", locationLabel],
              ["Status", ORDER_STATUS_LABEL[status]],
              ...(o.publicOrderCode ? [["Kode pesanan", o.publicOrderCode]] : []),
            ].map(([k, v]) => (
              <div key={k} className={row}>
                <span className="text-[14px] text-muted-foreground">{k}</span>
                <span className="truncate text-right text-[14px] font-medium">{v}</span>
              </div>
            ))}
          </div>
          <p className="py-2 text-center text-[11.5px] text-muted-foreground">
            {lastSyncedAt ? `Diperbarui ${snapshotAgeLabel(lastSyncedAt)}` : ""}
            {syncFailed ? " · Gagal memperbarui, coba lagi" : ""}
            {timeline.canRefresh && (
              <>
                {lastSyncedAt || syncFailed ? " · " : ""}
                <button
                  type="button"
                  onClick={() => void refreshStatus()}
                  className="font-semibold text-foreground underline"
                >
                  Perbarui status
                </button>
              </>
            )}
          </p>
        </section>
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

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setSupportOpen(true)} className={btnSoft}>
          <span className="flex items-center justify-center gap-2">
            <Headphones className="size-4" aria-hidden="true" /> Chat support
          </span>
        </button>
        {!isHistory && (
          <Link to={reorder.href} params={{ id: reorder.packageId }} className={btnSoft}>
            <Plus className="size-4" aria-hidden="true" /> {reorder.label}
          </Link>
        )}
      </div>
      {reorder.fallbackDestinationCode && isHistory && (
        <Link
          to="/destination/$code"
          params={{ code: reorder.fallbackDestinationCode }}
          className={`${btnSoft} mt-2 text-center`}
        >
          Lihat paket lain untuk {locationCodesLabel([reorder.fallbackDestinationCode])}
        </Link>
      )}

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
