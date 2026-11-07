import { CircleAlert, Database, Server } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import {
  AdminShell,
  AdminStatStrip,
  AdminSurface,
  SectionHeading,
  StatusPill,
} from "@/components/admin-shell";
import { getAdminReadiness } from "@/lib/admin-readiness.fn";
import { AdminHomeEsimPanel } from "@/components/admin-home-esim-panel";
import { getAdminHomeEsimConfig } from "@/lib/home-esim-config.fn";
import { AdminGeoPanel } from "@/components/admin-geo-panel";
import { getAdminGeoConfig } from "@/lib/geo-config.fn";
import { AdminPwaPanel } from "@/components/admin-pwa-panel";
import { getAdminPwa } from "@/lib/pwa.fn";
import { AdminEsimSharingPanel } from "@/components/admin-esim-sharing-panel";
import { getAdminEsimSharing } from "@/lib/admin-esim-share.fn";
import { AdminItineraryMapPanel } from "@/components/admin-itinerary-map-panel";
import { AdminReceiptScanPanel } from "@/components/admin-receipt-scan-panel";
import { getAdminReceiptScan } from "@/lib/receipt-scan.fn";
import { AdminPlaceIdeasPanel } from "@/components/admin-place-ideas-panel";
import { AdminGuestTripsPanel } from "@/components/admin-guest-trips-panel";
import { getAdminGuestTrips } from "@/lib/guest-trips.fn";
import { getAdminPlaceIdeas } from "@/lib/place-ideas.fn";
import { AdminGooglePanel } from "@/components/admin-google-panel";
import { getAdminGoogle } from "@/lib/google-admin.fn";
import { getAdminItineraryMap } from "@/lib/itinerary-map.fn";
import { getHomeDestinationFeed } from "@/lib/destination-availability.fn";
export const Route = createFileRoute("/admin/settings")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: async () => ({
    readiness: await getAdminReadiness(),
    homeEsim: await getAdminHomeEsimConfig(),
    geo: await getAdminGeoConfig(),
    pwa: await getAdminPwa(),
    esimSharing: await getAdminEsimSharing(),
    itineraryMap: await getAdminItineraryMap(),
    receiptScan: await getAdminReceiptScan(),
    placeIdeas: await getAdminPlaceIdeas(),
    guestTrips: await getAdminGuestTrips(),
    google: await getAdminGoogle(),
    rail: (await getHomeDestinationFeed().catch(() => ({ popular: [] }))).popular,
  }),
  component: AdminSettings,
});
function AdminSettings() {
  const {
    readiness,
    homeEsim,
    geo,
    pwa,
    esimSharing,
    itineraryMap,
    receiptScan,
    placeIdeas,
    guestTrips,
    google,
    rail,
  } = Route.useLoaderData();
  const counted = readiness.filter((x) => !x.external);
  const ready = counted.filter((x) => x.ready).length;
  return (
    <AdminShell title="Settings" subtitle="Server readiness">
      <AdminHomeEsimPanel initial={homeEsim.config} version={homeEsim.version} railPool={rail} />
      <AdminGeoPanel initial={geo.config} version={geo.version} />
      <AdminPwaPanel initial={pwa.config} version={pwa.version} stats={pwa.stats} />
      <AdminEsimSharingPanel initial={esimSharing.config} version={esimSharing.version} />
      <AdminItineraryMapPanel
        initial={itineraryMap.config}
        version={itineraryMap.version}
        stats={itineraryMap.stats}
      />
      <AdminReceiptScanPanel
        initial={receiptScan.config}
        version={receiptScan.version}
        stats={receiptScan.stats}
        aiConfigured={receiptScan.aiConfigured}
      />
      <AdminPlaceIdeasPanel
        initial={placeIdeas.config}
        version={placeIdeas.version}
        stats={placeIdeas.stats}
        recent={placeIdeas.recent}
        keys={placeIdeas.keys}
      />
      <AdminGuestTripsPanel
        initial={guestTrips.config}
        version={guestTrips.version}
        stats={guestTrips.stats}
      />
      <AdminGooglePanel overview={google} />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeading
            title="System readiness"
            detail="Credential, secret, pricing, dan maintenance tetap di server."
          />
          <StatusPill tone={ready === counted.length ? "good" : "warn"}>
            {ready}/{counted.length} ready
          </StatusPill>
        </div>
        <AdminSurface className="p-2.5">
          <AdminStatStrip
            columns={3}
            items={[
              {
                label: "Ready",
                value: String(ready),
                tone: ready === counted.length ? "good" : "warn",
              },
              { label: "Belum tersedia", value: String(counted.length - ready) },
            ]}
          />
        </AdminSurface>
        <AdminSurface className="p-3">
          <div className="divide-y divide-border">
            {readiness.map((item) => (
              <ReadinessRow key={item.name} item={item} />
            ))}
          </div>
          <div className="mt-3 flex gap-2 rounded-xl bg-[#fffaf0] p-3 text-xs text-muted-foreground">
            <CircleAlert className="size-4 shrink-0 text-[#b87400]" />
            <p>Secret dan raw provider payload tidak pernah ditampilkan.</p>
          </div>
        </AdminSurface>
      </div>
    </AdminShell>
  );
}
function ReadinessRow({
  item,
}: {
  item: { name: string; ready: boolean; detail: string; external?: boolean };
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-2">
      <span className="rounded-xl bg-secondary p-2">
        {item.ready ? (
          <Database className="size-4 text-success" />
        ) : (
          <Server className="size-4 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
      </div>
      <StatusPill tone={item.external ? "neutral" : item.ready ? "good" : "warn"}>
        {item.external ? "Eksternal" : item.ready ? "Ready" : "Belum tersedia"}
      </StatusPill>
    </div>
  );
}
