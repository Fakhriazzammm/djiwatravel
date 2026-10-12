import { ClipboardList } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminOrders } from "@/lib/admin-read-model.server";
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
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-xs text-[#6b6b72]">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Lifecycle</th>
                  <th className="p-3">Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0">
                    <td className="p-3">
                      <Link
                        className="font-semibold text-[#0a67c7]"
                        to="/admin/orders/$id"
                        params={{ id: order.id }}
                      >
                        {order.publicOrderCode}
                      </Link>
                    </td>
                    <td className="p-3">{order.customer ?? "masked unavailable"}</td>
                    <td className="p-3">
                      {order.currencyCode} {order.totalAmount.toLocaleString("id-ID")}
                    </td>
                    <td className="p-3">
                      <div>{order.status}</div>
                      <div className="text-xs text-[#8a8a91]">
                        {order.provisioningStatus ?? "no provisioning row"}
                      </div>
                    </td>
                    <td className="p-3 text-xs">
                      {new Date(order.createdAt).toLocaleString("id-ID")}
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
