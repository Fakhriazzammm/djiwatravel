import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, QrCode, Plus, Headphones } from "lucide-react";
import { Page, BackBar, btnRed, btnSoft, group, row } from "@/components/shell";
import { EsimQr, InstallGuide, ManualDetails } from "@/components/esim-install";
import { rupiah } from "@/lib/pricing";
import {
  cancelOrder,
  hasGuestOrderAccess,
  markInstalled,
  refreshOrdersFromServer,
  useOrders,
} from "@/lib/orders";
import { SUPPORT_WHATSAPP_URL } from "@/lib/guest-order-access.server";
import { effectiveOrderStatus, ORDER_STATUS_LABEL } from "@/lib/esim-status";
import { TravelTimeline } from "@/components/travel-timeline";
import { TravelChecklist } from "@/components/travel-checklist";
import { TravelUsageCard } from "@/components/travel-usage-card";
import { TravelSupportDialog } from "@/components/travel-support-dialog";
import { OfflineSnapshotBanner } from "@/components/offline-snapshot-banner";
import { readTripPlan, setChecklistItem, writeDepartureDate } from "@/lib/travel-checklist-store";
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
  }, [o?.id, o?.status, o?.expiresAt, o?.esim?.lpa, o?.usedGb]);

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
        <div className="mt-20 h-40 animate-pulse rounded-2xl bg-secondary" />
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
  const canInstall = Boolean(o.esim) && (status === "READY" || status === "INSTALLED");
  const packageName = o.packageName ?? o.packageId;
  const locationLabel = o.locationCodes?.join(", ") || "Regional";
  const durationDays = o.durationDays ?? 0;
  const quotaLabel =
    o.volumeBytes == null ? "Unlimited" : `${(o.volumeBytes / 1_000_000_000).toFixed(1)} GB`;
  const timeline = activationTimeline(status);
  const usage = usageView({
    volumeBytes: o.volumeBytes ?? null,
    usedGb: o.usedGb ?? null,
    active: canInstall,
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
      <BackBar title={`🌐 ${packageName}`} />
      <TravelTimeline
        timeline={timeline}
        lastSyncedAt={lastSyncedAt}
        syncFailed={syncFailed}
        onRefresh={refreshStatus}
      />

      {status === "PROVISIONING_FAILED" && (
        <div className="mt-4 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-4">
          <p className="font-semibold">Pemrosesan belum berhasil</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Kami dapat mencoba memproses pesanan ini kembali tanpa membuat order ganda.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Pembayaran tetap tercatat. Hubungi support agar kami meninjau pesanan.
          </p>
        </div>
      )}
      {actionMessage && (
        <p className="mt-3 text-center text-sm text-muted-foreground">{actionMessage}</p>
      )}

      <div className={`${group} mt-4`}>
        {[
          ["Paket", `${quotaLabel} · ${durationDays} hari`],
          ...(canInstall ? [["Berlaku sampai", `±${exp}`]] : []),
          ["Status", ORDER_STATUS_LABEL[status]],
          ["Destinasi", locationLabel],
        ].map(([k, v]) => (
          <div key={k} className={row}>
            <span className="text-[14px] text-muted-foreground">{k}</span>
            <span className="truncate text-[14px] font-medium">{v}</span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <TravelUsageCard view={usage} />
      </div>

      <div className="mt-4">
        <Link to={reorder.href} params={{ id: reorder.packageId }} className={btnRed}>
          {reorder.label}
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
          Harga dan ketersediaan dicek ulang saat checkout, jadi selalu mengikuti katalog terbaru.
        </p>
      </div>

      <div className="mt-4">
        <TravelChecklist
          items={checklist}
          departureDate={trip.departureDate}
          daysUntil={daysUntil}
          progress={progress}
          onSetDepartureDate={(value) => setTrip(writeDepartureDate(id, value))}
          onToggle={(key, done) => setTrip(setChecklistItem(id, key, done))}
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

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          {
            id: "install",
            l: "Instalasi",
            i: QrCode,
            on: () => setTab(tab === "install" ? "none" : "install"),
            off: !canInstall,
          },
          {
            id: "topup",
            l: "Top Up",
            i: Plus,
            on: () => setTab(tab === "topup" ? "none" : "topup"),
            off: true,
          },
          {
            id: "support",
            l: "Support",
            i: Headphones,
            on: () => setSupportOpen(true),
          },
        ].map(({ id, l, i: I, on, off }) => (
          <button
            key={id}
            disabled={off}
            onClick={on}
            className={`tap flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-semibold disabled:opacity-40 ${tab === id ? "bg-brand-red-soft text-brand-red" : "bg-surface"}`}
          >
            <I className="size-5" strokeWidth={1.8} />
            {l}
          </button>
        ))}
      </div>

      {tab === "install" && canInstall && o.esim && (
        <div className="mt-6 space-y-6">
          <EsimQr esim={o.esim} />
          <InstallGuide />
        </div>
      )}
      {tab === "topup" && (
        <div className="mt-6 rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
          Top up belum tersedia; pembayaran dan provisioning masih dinonaktifkan.
        </div>
      )}

      <button
        onClick={() => setTech(!tech)}
        className="mt-6 flex h-11 w-full items-center justify-between rounded-2xl bg-surface px-4 text-[14px] text-muted-foreground"
      >
        Detail Teknis <ChevronDown className={`size-4 transition ${tech ? "rotate-180" : ""}`} />
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
      <Link to="/my-esim" className="sr-only">
        My eSIM
      </Link>
    </Page>
  );
}
