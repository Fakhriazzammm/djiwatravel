import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Headphones,
  Info,
  Plus,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
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
import { EsimQr, InstallGuide, ManualDetails } from "@/components/esim-install";
import { hasGuestOrderAccess, refreshOrdersFromServer, useOrders } from "@/lib/orders";
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
  const isReady = status === "READY";
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
      <BackBar title="Detail eSIM" />

      <section className="overflow-hidden rounded-[28px] bg-primary p-5 text-primary-foreground shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/65">
              eSIM kamu
            </p>
            <h1 className="mt-2 text-[26px] font-bold leading-tight">{packageName}</h1>
            <p className="mt-1 text-sm text-primary-foreground/75">
              {locationLabel} · {quotaLabel} · {durationDays} hari
            </p>
          </div>
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
              isReady ? "bg-success/20 text-success" : "bg-white/10 text-white"
            }`}
          >
            {isReady ? (
              <CheckCircle2 className="size-6" strokeWidth={2.2} />
            ) : (
              <Smartphone className="size-6" strokeWidth={1.8} />
            )}
          </div>
        </div>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xl font-bold">{ORDER_STATUS_LABEL[status]}</p>
            <p className="mt-1 text-[13px] text-primary-foreground/70">
              {isReady
                ? "Sudah siap dipasang di perangkatmu."
                : "Kami akan memperbarui status secara otomatis."}
            </p>
          </div>
          {canInstall && <Wifi className="size-7 text-primary-foreground/80" aria-hidden="true" />}
        </div>
      </section>

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
        <section className="mt-4 rounded-3xl border border-brand-red/15 bg-brand-red-soft/45 p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-red text-white">
              <QrCode className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold">Pasang eSIM sekarang</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Scan QR sebelum berangkat saat perangkat terhubung ke Wi-Fi.
              </p>
            </div>
          </div>
          {tab !== "install" ? (
            <button type="button" onClick={() => setTab("install")} className={`${btnRed} mt-4`}>
              <QrCode className="size-5" aria-hidden="true" /> Tampilkan QR Code
            </button>
          ) : (
            <div className="mt-4 space-y-5">
              <EsimQr esim={o.esim} />
              <InstallGuide />
              <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                QR dan kode aktivasi hanya untuk perangkatmu. Jangan bagikan ke orang lain.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="mt-4 rounded-2xl bg-surface p-4">
        <SectionTitle>Ringkasan paket</SectionTitle>
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
        <TravelUsageCard view={usage} />
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
        className="mt-4 flex h-11 w-full items-center justify-between rounded-2xl bg-surface px-4 text-[14px] text-muted-foreground"
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
        <StickyCta>
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
