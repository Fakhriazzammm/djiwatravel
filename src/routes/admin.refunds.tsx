import { createFileRoute, Link } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminRefundRequests } from "@/lib/admin-read-model.server";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime, humanizeAdminStatus, projectAdminAmount } from "@/lib/admin-display";

export const Route = createFileRoute("/admin/refunds")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminRefundRequests(),
  component: AdminRefunds,
});

function AdminRefunds() {
  const refunds = Route.useLoaderData();
  return (
    <AdminShell
      title="Refunds"
      subtitle="Read-only refund queue. Tidak ada tombol provider, status mutation, atau financial write."
    >
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            title="Refund requests"
            detail="Provider reference/error hanya ditampilkan sebagai status tereduksi; detail rahasia tidak dikirim ke browser."
          />
          <StatusPill>{refunds.length} terbaru</StatusPill>
        </div>
        {refunds.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Belum ada refund request.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Request status</th>
                  <th className="p-3">Order status</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Events</th>
                  <th className="p-3">Updated</th>
                  <th className="p-3">Provider note</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((item) => (
                  <tr key={item.id} className="border-b align-top last:border-0">
                    <td className="p-3">
                      <Link
                        to={`/admin/orders/${item.orderId}` as never}
                        className="font-semibold text-brand-red"
                      >
                        {item.orderCode}
                      </Link>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{item.id}</div>
                    </td>
                    <td className="p-3">
                      <StatusPill tone={item.status === "REFUNDED" ? "good" : "warn"}>
                        {humanizeAdminStatus(item.status)}
                      </StatusPill>
                    </td>
                    <td className="p-3">{humanizeAdminStatus(item.orderStatus)}</td>
                    <td className="p-3">
                      {projectAdminAmount(item.amount, item.currencyCode, false)}
                    </td>
                    <td className="p-3">{item.eventCount}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatAdminDateTime(item.updatedAt)}
                    </td>
                    <td className="max-w-[240px] p-3 text-xs text-destructive">
                      {item.providerError ?? "No provider result recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
