import { ClipboardList, Eye, EyeOff } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminOrders } from "@/lib/admin-read-model.server";
import {
  formatAdminDateTime,
  humanizeAdminStatus,
  projectAdminAmount,
  projectAdminCustomer,
  projectAdminPrivacy,
} from "@/lib/admin-display";
import { AdminDetailSheet, AdminShell, AdminSurface, StatusPill } from "@/components/admin-shell";
export const Route = createFileRoute("/admin/orders")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminOrders(),
  component: AdminOrders,
});
function AdminOrders() {
  const orders = Route.useLoaderData();
  const [privateMode, setPrivateMode] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const newest = orders[0];
  const card = (order: (typeof orders)[number]) => (
    <Link
      to={order.detailHref as never}
      className="block rounded-xl bg-[#f7f7f8] p-2.5 text-xs active:bg-[#ececf0]"
    >
      <div className="flex items-center justify-between gap-2">
        <b className="truncate">{projectAdminPrivacy(order.displayIdentifier, privateMode)}</b>
        <StatusPill>{humanizeAdminStatus(order.status)}</StatusPill>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-[#6e6e73]">
        <span className="truncate">{projectAdminCustomer(order.customer, privateMode).label}</span>
        <span className="truncate text-right">
          {projectAdminAmount(order.totalAmount, order.currencyCode, privateMode)}
        </span>
        <span className="truncate">
          {projectAdminPrivacy(order.itemSummary ?? "Paket —", privateMode)}
        </span>
        <span className="truncate text-right">
          eSIM {humanizeAdminStatus(order.provisioningStatus)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[#8e8e93]">
        <span className="truncate">
          {projectAdminPrivacy(order.paymentProviderLabel ?? "Payment —", privateMode)}
        </span>
        <span className="shrink-0">{formatAdminDateTime(order.updatedAt)}</span>
      </div>
    </Link>
  );
  return (
    <AdminShell title="Orders" subtitle="Daftar order Travel">
      <div className="space-y-2">
        <AdminSurface className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73]">
                Monitoring order
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {privateMode ? "••••" : orders.length}{" "}
                <span className="text-xs font-medium text-[#6e6e73]">total</span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              <StatusPill>{newest ? humanizeAdminStatus(newest.status) : "Kosong"}</StatusPill>
              <button
                type="button"
                onClick={() => setPrivateMode((v) => !v)}
                aria-label="Mode privasi"
                aria-pressed={privateMode}
                className="min-h-11 min-w-11 rounded-xl border bg-white p-2"
              >
                {privateMode ? (
                  <EyeOff className="mx-auto size-4" />
                ) : (
                  <Eye className="mx-auto size-4" />
                )}
              </button>
            </div>
          </div>
          {newest ? (
            <>
              <p className="mt-3 text-[11px] font-medium text-[#6e6e73]">Order terbaru</p>
              <div className="mt-1">{card(newest)}</div>
              <button
                type="button"
                onClick={() => setListOpen(true)}
                className="mt-2 min-h-11 w-full rounded-xl bg-[#0a84ff] px-3 text-xs font-semibold text-white active:bg-[#006fe6]"
              >
                Lihat semua order
              </button>
            </>
          ) : (
            <div className="mt-3 flex items-center gap-3 text-sm text-[#6e6e73]">
              <ClipboardList className="size-5" />
              Belum ada order dari database Travel.
            </div>
          )}
        </AdminSurface>
        <AdminSurface className="hidden p-3 lg:block">
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="border-b text-left text-[#6e6e73]">
                <tr>
                  {["Order", "Customer", "Paket / total", "Status", "Dibuat / diperbarui"].map(
                    (x) => (
                      <th key={x} className="px-2.5 py-2">
                        {x}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((order) => (
                  <tr key={order.detailHref}>
                    <td className="px-2.5 py-2">
                      <Link className="font-semibold text-[#0a67c7]" to={order.detailHref as never}>
                        {projectAdminPrivacy(order.displayIdentifier, privateMode)}
                      </Link>
                      <div className="text-[#8e8e93]">
                        {projectAdminPrivacy(
                          order.paymentProviderLabel ?? "Payment belum tersedia",
                          privateMode,
                        )}
                      </div>
                    </td>
                    <td className="px-2.5 py-2">
                      {projectAdminCustomer(order.customer, privateMode).label}
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="max-w-[230px] truncate">
                        {projectAdminPrivacy(
                          order.itemSummary ?? "Item belum tersedia",
                          privateMode,
                        )}
                      </div>
                      <b>
                        {projectAdminAmount(order.totalAmount, order.currencyCode, privateMode)}
                      </b>
                    </td>
                    <td className="px-2.5 py-2">
                      {humanizeAdminStatus(order.status)}
                      <div className="text-[#8e8e93]">
                        eSIM: {humanizeAdminStatus(order.provisioningStatus)}
                      </div>
                    </td>
                    <td className="px-2.5 py-2 text-[#6e6e73]">
                      {formatAdminDateTime(order.createdAt)}
                      <div>Update {formatAdminDateTime(order.updatedAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminSurface>
      </div>
      <AdminDetailSheet
        open={listOpen}
        title={`Semua order · ${orders.length}`}
        onClose={() => setListOpen(false)}
      >
        <div className="space-y-2">{orders.map(card)}</div>
      </AdminDetailSheet>
    </AdminShell>
  );
}
