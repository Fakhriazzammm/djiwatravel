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
import { getHomeDestinationFeed } from "@/lib/destination-availability.fn";
export const Route = createFileRoute("/admin/settings")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: async () => ({
    readiness: await getAdminReadiness(),
    homeEsim: await getAdminHomeEsimConfig(),
    geo: await getAdminGeoConfig(),
    rail: (await getHomeDestinationFeed().catch(() => ({ popular: [] }))).popular,
  }),
  component: AdminSettings,
});
function AdminSettings() {
  const { readiness, homeEsim, geo, rail } = Route.useLoaderData();
  const ready = readiness.filter((x) => x.ready).length;
  return (
    <AdminShell title="Settings" subtitle="Server readiness">
      <AdminHomeEsimPanel initial={homeEsim.config} version={homeEsim.version} railPool={rail} />
      <AdminGeoPanel initial={geo.config} version={geo.version} />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeading
            title="System readiness"
            detail="Credential, secret, pricing, dan maintenance tetap di server."
          />
          <StatusPill tone={ready === readiness.length ? "good" : "warn"}>
            {ready}/{readiness.length} ready
          </StatusPill>
        </div>
        <AdminSurface className="p-2.5">
          <AdminStatStrip
            columns={3}
            items={[
              {
                label: "Ready",
                value: String(ready),
                tone: ready === readiness.length ? "good" : "warn",
              },
              { label: "Belum tersedia", value: String(readiness.length - ready) },
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
function ReadinessRow({ item }: { item: { name: string; ready: boolean; detail: string } }) {
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
      <StatusPill tone={item.ready ? "good" : "warn"}>
        {item.ready ? "Ready" : "Belum tersedia"}
      </StatusPill>
    </div>
  );
}
