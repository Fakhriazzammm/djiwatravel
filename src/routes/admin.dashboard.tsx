import { RefreshCw } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.fn";
import { getAdminAlerts } from "@/lib/analytics-insights.fn";
import { getTrafficDashboard } from "@/lib/traffic-dashboard.fn";
import { RANGE_KEYS, parseDay } from "@/lib/date-range";
import { TrafficPanel, type DashboardAlert } from "@/components/admin-traffic-panel";
import { AdminShell } from "@/components/admin-shell";

const LOW_BALANCE_USD = 5;

export const Route = createFileRoute("/admin/dashboard")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: z.object({
    range: z.enum(RANGE_KEYS).catch("24j").default("24j"),
    from: z.string().optional().catch(undefined),
    to: z.string().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({
    range: search.range,
    from: parseDay(search.from) === null ? undefined : search.from,
    to: parseDay(search.to) === null ? undefined : search.to,
  }),
  loader: async ({ deps }) => {
    const [ops, census, insightAlerts] = await Promise.all([
      getAdminDashboard({ data: { period: "daily" } }),
      getTrafficDashboard({ data: deps }),
      getAdminAlerts(),
    ]);
    return { provider: ops.providerBalance, census, insightAlerts };
  },
  component: AdminDashboard,
});

function AdminDashboard() {
  const { provider, census, insightAlerts } = Route.useLoaderData();
  const { range, from, to } = Route.useSearch();
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
  const critical = insightAlerts.filter((a) => a.severity === "critical").length;
  if (insightAlerts.length > 0)
    alerts.push({
      key: "insights",
      text: `${insightAlerts.length} peringatan analitik${critical ? ` (${critical} kritis)` : ""}`,
      href: "/admin/analytics",
      danger: critical > 0,
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
      <TrafficPanel
        data={census}
        range={{ range, from, to }}
        alerts={alerts}
        providerLabel={providerLabel}
      />
    </AdminShell>
  );
}
