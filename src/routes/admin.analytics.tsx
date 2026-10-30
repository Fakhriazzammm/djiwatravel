import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.fn";
import { AdminShell, AdminStatStrip, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { humanizeAdminStatus } from "@/lib/admin-display";

export const Route = createFileRoute("/admin/analytics")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: (search) => ({ period: search.period === "weekly" || search.period === "monthly" ? search.period : "daily" }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getAdminDashboard({ data: deps }),
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const data = Route.useLoaderData();
  return (
    <AdminShell title="Analytics" subtitle="Tren order dan status operasional dari database Travel.">
      <div className="space-y-2">
        <AdminSurface className="p-3">
          <AdminStatStrip columns={4} items={[
            { label: "Orders", value: String(data.counts.total) },
            { label: "Dibayar", value: String(data.counts.paid) },
            { label: "eSIM siap", value: String(data.counts.provisioningReady), tone: "good" },
            { label: "Belum siap", value: String(data.counts.paidNotReady), tone: data.counts.paidNotReady ? "warn" : "neutral" },
          ]} />
        </AdminSurface>
        <AdminSurface className="p-3">
          <SectionHeading title="Status order" detail={`Periode ${data.period}; status tanpa data tidak dibuat-buat.`} />
          <div className="mt-3 divide-y divide-border">
            {data.statuses.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Belum ada data pada periode ini.</p> : data.statuses.map((item) => (
              <div key={item.status} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{humanizeAdminStatus(item.status)}</span><StatusPill>{item.count}</StatusPill></div>
            ))}
          </div>
        </AdminSurface>
      </div>
    </AdminShell>
  );
}
