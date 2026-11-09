import { RefreshCw } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.fn";
import { getTrafficDashboard } from "@/lib/traffic-dashboard.fn";
import { TRAFFIC_RANGES } from "@/lib/traffic-dashboard";
import { TrafficPanel, type DashboardAlert } from "@/components/admin-traffic-panel";
import { AdminShell } from "@/components/admin-shell";

const LOW_BALANCE_USD = 5;

export const Route = createFileRoute("/admin/dashboard")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: z.object({ range: z.enum(TRAFFIC_RANGES).default("24j") }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: async ({ deps }) => {
    const [ops, census] = await Promise.all([
      getAdminDashboard({ data: { period: "daily" } }),
      getTrafficDashboard({ data: { range: deps.range } }),
    ]);
    return { provider: ops.providerBalance, census };
  },
  component: AdminDashboard,
});

function AdminDashboard() {
  const { provider, census } = Route.useLoaderData();
  const { range } = Route.useSearch();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const alerts: DashboardAlert[] = [];
  if (provider.state !== "ok")
    alerts.push({
      key: "provider",
      text: "Saldo provider tidak terbaca",
      href: "/admin/settings",
      danger: true,
    });
  else if (provider.usd !== null && provider.usd < LOW_BALANCE_USD)
    alerts.push({
      key: "low",
      text: "Saldo provider rendah",
      href: "/admin/finance",
      danger: false,
    });
  const providerLabel =
    provider.state === "ok" && provider.usd !== null
      ? `US$${provider.usd.toFixed(2)}`
      : "tidak terbaca";
  return (
    <AdminShell title="Dashboard" subtitle="Orang, AI, dan penjualan, dihitung terpisah">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          disabled={refreshing}
          aria-label="Refresh dashboard"
          onClick={async () => {
            setRefreshing(true);
            try {
              await router.invalidate();
            } finally {
              setRefreshing(false);
            }
          }}
          className="inline-flex size-8 items-center justify-center border border-border"
        >
          <RefreshCw
            className={`size-3.5 ${refreshing ? "animate-spin" : ""} motion-reduce:animate-none`}
          />
        </button>
      </div>
      <TrafficPanel data={census} range={range} alerts={alerts} providerLabel={providerLabel} />
    </AdminShell>
  );
}
