import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AdminShell } from "@/components/admin-shell";
import {
  AlertsStrip,
  DestinationsPanel,
  FeaturesPanel,
  FunnelPanel,
  OperationsPanel,
  RevenuePanel,
  UsersPanel,
} from "@/components/admin-analytics-panels";
import { requireAdmin } from "@/lib/admin-guard";
import {
  INSIGHT_RANGE_LABEL,
  INSIGHT_RANGES,
  INSIGHT_TAB_LABEL,
  INSIGHT_TABS,
} from "@/lib/analytics-insights";
import { getAnalyticsInsights } from "@/lib/analytics-insights.fn";

export const Route = createFileRoute("/admin/analytics")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: z.object({
    tab: z.enum(INSIGHT_TABS).catch("pengguna").default("pengguna"),
    range: z.enum(INSIGHT_RANGES).catch("30h").default("30h"),
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab, range: search.range }),
  loader: ({ deps }) => getAnalyticsInsights({ data: deps }),
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const data = Route.useLoaderData();
  const { tab, range } = Route.useSearch();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <AdminShell
      title="Analitik"
      subtitle="Pengguna, funnel, pendapatan, dan destinasi dari data yang sudah ada"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <nav className="inline-flex flex-wrap border border-border" aria-label="Bagian analitik">
          {INSIGHT_TABS.map((t) => (
            <Link
              key={t}
              to="/admin/analytics"
              search={{ tab: t, range }}
              aria-current={t === tab ? "page" : undefined}
              className={`min-h-9 px-3 py-2 text-[12px] font-semibold ${t === tab ? "bg-foreground text-background" : "hover:bg-secondary"}`}
            >
              {INSIGHT_TAB_LABEL[t]}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <nav className="inline-flex border border-border" aria-label="Rentang waktu">
            {INSIGHT_RANGES.map((r) => (
              <Link
                key={r}
                to="/admin/analytics"
                search={{ tab, range: r }}
                aria-current={r === range ? "page" : undefined}
                className={`min-h-9 px-2.5 py-2 text-[11.5px] font-medium ${r === range ? "bg-foreground text-background" : "hover:bg-secondary"}`}
              >
                {INSIGHT_RANGE_LABEL[r]}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            aria-label="Muat ulang analitik"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                await router.invalidate();
              } finally {
                setRefreshing(false);
              }
            }}
            className="inline-flex min-h-9 min-w-9 items-center justify-center border border-border hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <p className="mb-3 text-[10.5px] text-muted-foreground">
        Dibandingkan dengan periode sebelumnya dengan panjang yang sama. Diperbarui{" "}
        {new Date(data.updatedAt).toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        WIB.
      </p>
      <AlertsStrip alerts={data.alerts} />
      {tab === "pengguna" && <UsersPanel result={data.users} />}
      {tab === "funnel" && <FunnelPanel result={data.funnel} />}
      {tab === "pendapatan" && <RevenuePanel result={data.revenue} />}
      {tab === "destinasi" && <DestinationsPanel result={data.destinations} />}
      {tab === "fitur" && <FeaturesPanel result={data.features} />}
      {tab === "operasional" && <OperationsPanel result={data.operations} />}
    </AdminShell>
  );
}
