import { ClipboardList } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminOrders } from "@/lib/admin-read-model.server";
import { formatAdminDateTime, humanizeAdminStatus } from "@/lib/admin-display";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/orders")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminOrders(),
  component: AdminOrders,
});
function AdminOrders() {
  const orders = Route.useLoaderData();
  return (
    <AdminShell title="Orders" subtitle="Satu daftar order untuk menelusuri payment sampai eSIM.">
      <section className="mt-6 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            title="Daftar order"
            detail="Customer masked; secret provider dan payload tidak dikirim ke browser."
          />
          <StatusPill>{orders.length} terbaru</StatusPill>
        </div>
        {orders.length === 0 ? (
          <div className="mt-5 flex flex-col items-center rounded-xl border border-dashed border-[#d5d5da] px-5 py-12 text-center">
            <ClipboardList className="size-8 text-[#8a8a91]" />
            <p className="mt-3 text-sm font-semibold">Belum ada order</p>
            <p className="mt-1 text-sm text-[#6b6b72]">Tidak ada record dari database Travel.</p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-xs text-[#6b6b72]">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Paket / total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Dibuat / diperbarui</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b align-top last:border-0">
                    <td className="p-3">
                      <Link
                        className="font-semibold text-[#0a67c7]"
                        to="/admin/orders/$id"
                        params={{ id: order.id }}
                      >
                        {order.publicOrderCode}
                      </Link>
                      <div className="mt-1 text-xs text-[#8a8a91]">
                        {order.paymentProvider ?? "Payment belum tersedia"}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{order.customer.label}</div>
                      {order.customer.email && (
                        <div className="text-xs text-[#6b6b72]">{order.customer.email}</div>
                      )}
                      {order.customer.whatsapp && (
                        <div className="text-xs text-[#6b6b72]">WA {order.customer.whatsapp}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div
                        className="max-w-[230px] truncate"
                        title={order.itemSummary ?? undefined}
                      >
                        {order.itemSummary ?? "Item belum tersedia"}
                      </div>
                      <div className="mt-1 font-semibold">
                        {order.currencyCode} {order.totalAmount.toLocaleString("id-ID")}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{humanizeAdminStatus(order.status)}</div>
                      <div className="text-xs text-[#8a8a91]">
                        eSIM: {humanizeAdminStatus(order.provisioningStatus)}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-[#6b6b72]">
                      <div>{formatAdminDateTime(order.createdAt)}</div>
                      <div className="mt-1">Update {formatAdminDateTime(order.updatedAt)}</div>
                      {order.paymentReference && (
                        <div className="mt-1">Ref: {order.paymentReference}</div>
                      )}
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
