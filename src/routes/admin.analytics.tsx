import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.fn";
import {
  AdminShell,
  AdminStatStrip,
  AdminSurface,
  SectionHeading,
  StatusPill,
} from "@/components/admin-shell";
import { humanizeAdminStatus } from "@/lib/admin-display";
import { getHomeEsimFunnel } from "@/lib/home-esim-events.fn";
import { funnelRates } from "@/lib/home-esim-events";

export const Route = createFileRoute("/admin/analytics")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: (search) => ({
    period: search.period === "weekly" || search.period === "monthly" ? search.period : "daily",
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({
    ...(await getAdminDashboard({ data: deps })),
    homeFunnel: await getHomeEsimFunnel(),
  }),
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const data = Route.useLoaderData();
  return (
    <AdminShell
      title="Analytics"
      subtitle="Tren order dan status operasional dari database Travel."
    >
      <div className="space-y-2">
        <AdminSurface className="p-3">
          <AdminStatStrip
            columns={4}
            items={[
              { label: "Orders", value: String(data.counts.total) },
              { label: "Dibayar", value: String(data.counts.paid) },
              { label: "eSIM siap", value: String(data.counts.provisioningReady), tone: "good" },
              {
                label: "Belum siap",
                value: String(data.counts.paidNotReady),
                tone: data.counts.paidNotReady ? "warn" : "neutral",
              },
            ]}
          />
        </AdminSurface>
        <AdminSurface className="p-3">
          <SectionHeading
            title="Corong eSIM Beranda"
            detail={`${data.homeFunnel?.days ?? 7} hari terakhir; event anonim dari kartu Beranda.`}
          />
          {data.homeFunnel === null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Data event belum tersedia (tabel belum dimigrasi atau database tidak terbaca).
            </p>
          ) : (
            <>
              <div className="mt-3">
                <AdminStatStrip
                  columns={4}
                  items={[
                    { label: "Ketuk rel", value: String(data.homeFunnel.chipTaps) },
                    { label: "Sheet dibuka", value: String(data.homeFunnel.sheetOpens) },
                    { label: "Ketuk promo", value: String(data.homeFunnel.promoTaps) },
                    {
                      label: "Order dibuat",
                      value:
                        data.homeFunnel.ordersInWindow === null
                          ? "—"
                          : String(data.homeFunnel.ordersInWindow),
                    },
                  ]}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Rel → sheet: {funnelRates(data.homeFunnel).chipToSheet ?? "—"}
                {funnelRates(data.homeFunnel).chipToSheet === null ? "" : "%"}. Event tidak
                terhubung ke order, jadi order di samping hanya konteks, bukan konversi.
              </p>
              {data.homeFunnel.topDestinations.length > 0 && (
                <div className="mt-2 divide-y divide-border">
                  {data.homeFunnel.topDestinations.map((item) => (
                    <div key={item.code} className="flex items-center justify-between py-2 text-sm">
                      <span>{item.code}</span>
                      <StatusPill>{item.sheetOpens}</StatusPill>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </AdminSurface>
        <AdminSurface className="p-3">
          <SectionHeading
            title="Status order"
            detail={`Periode ${data.period}; status tanpa data tidak dibuat-buat.`}
          />
          <div className="mt-3 divide-y divide-border">
            {data.statuses.length === 0 ? (
              <p className="py-5 text-sm text-muted-foreground">Belum ada data pada periode ini.</p>
            ) : (
              data.statuses.map((item) => (
                <div
                  key={item.status}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <span>{humanizeAdminStatus(item.status)}</span>
                  <StatusPill>{item.count}</StatusPill>
                </div>
              ))
            )}
          </div>
        </AdminSurface>
      </div>
    </AdminShell>
  );
}
