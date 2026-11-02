import { ClipboardList, Eye, EyeOff, Search } from "lucide-react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminOrders } from "@/lib/admin-read-model.fn";
import { ADMIN_ORDER_STATUSES, ADMIN_ORDERS_PAGE_SIZE } from "@/lib/admin-orders-query";
import {
  formatAdminDateTime,
  humanizeAdminStatus,
  projectAdminAmount,
  projectAdminCustomer,
  projectAdminPrivacy,
} from "@/lib/admin-display";
import { AdminShell, AdminSurface, StatusPill } from "@/components/admin-shell";
export const Route = createFileRoute("/admin/orders")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: z.object({
    q: z.string().default(""),
    status: z.enum(ADMIN_ORDER_STATUSES).default("ALL").catch("ALL"),
    page: z.coerce.number().int().min(0).max(200).default(0).catch(0),
  }),
  loaderDeps: ({ search }) => ({ ...search }),
  loader: ({ deps }) => getAdminOrders({ data: deps }),
  component: AdminOrders,
});
function AdminOrders() {
  const orders = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [draft, setDraft] = useState(search.q);
  const [privateMode, setPrivateMode] = useState(false);
  const go = (patch: Partial<typeof search>) =>
    void router.navigate({ to: "/admin/orders", search: { ...search, ...patch } } as never);
  const hasMore = orders.length === ADMIN_ORDERS_PAGE_SIZE;
  const navigate = useNavigate();
  const openOrder = (detailHref: string) => {
    void navigate({ to: detailHref as never });
  };
  const card = (order: (typeof orders)[number]) => (
    <Link
      to={order.detailHref as never}
      className="block rounded-xl bg-secondary p-2.5 text-xs active:bg-secondary"
    >
      <div className="flex items-center justify-between gap-2">
        <b className="truncate">{projectAdminPrivacy(order.displayIdentifier, privateMode)}</b>
        <StatusPill>{humanizeAdminStatus(order.status)}</StatusPill>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
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
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
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
        <AdminSurface className="p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                go({ q: draft.trim(), page: 0 });
              }}
            >
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Cari kode order, email, atau referensi"
                  aria-label="Cari order"
                  className="min-h-11 w-full rounded-xl border border-border bg-secondary pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <button type="submit" className="min-h-11 rounded-xl bg-brand-red px-4 text-sm font-semibold text-white">
                Cari
              </button>
            </form>
            <select
              aria-label="Filter status order"
              value={search.status}
              onChange={(event) => go({ status: event.target.value as typeof search.status, page: 0 })}
              className="min-h-11 rounded-xl border border-border bg-surface px-2 text-xs"
            >
              {ADMIN_ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value === "ALL" ? "Semua status" : humanizeAdminStatus(value)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setPrivateMode((v) => !v)}
              aria-label="Mode privasi"
              aria-pressed={privateMode}
              className="min-h-11 min-w-11 rounded-xl border bg-surface p-2"
            >
              {privateMode ? <EyeOff className="mx-auto size-4" /> : <Eye className="mx-auto size-4" />}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Halaman {search.page + 1} · {privateMode ? "••" : orders.length} order ditampilkan
            {search.q ? ` untuk “${search.q}”` : ""}
          </p>
        </AdminSurface>
        {orders.length === 0 && (
          <AdminSurface className="p-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <ClipboardList className="size-5" />
              {search.q || search.status !== "ALL"
                ? "Tidak ada order yang cocok dengan pencarian atau filter."
                : "Belum ada order dari database Travel."}
            </div>
          </AdminSurface>
        )}
        <AdminSurface className="hidden p-3 lg:block">
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="border-b text-left text-muted-foreground">
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
                  <tr
                    key={order.detailHref}
                    tabIndex={0}
                    role="link"
                    onClick={() => openOrder(order.detailHref)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openOrder(order.detailHref);
                      }
                    }}
                    className="cursor-pointer outline-none hover:bg-secondary focus-visible:bg-secondary"
                  >
                    <td className="px-2.5 py-2">
                      <Link className="font-semibold text-brand-red" to={order.detailHref as never}>
                        {projectAdminPrivacy(order.displayIdentifier, privateMode)}
                      </Link>
                      <div className="text-muted-foreground">
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
                      <div className="text-muted-foreground">
                        eSIM: {humanizeAdminStatus(order.provisioningStatus)}
                      </div>
                    </td>
                    <td className="px-2.5 py-2 text-muted-foreground">
                      {formatAdminDateTime(order.createdAt)}
                      <div>Update {formatAdminDateTime(order.updatedAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminSurface>
        <div className="lg:hidden">
          <AdminSurface className="p-3">
                        <div className="space-y-1.5">{orders.map(card)}</div>
          </AdminSurface>
        </div>
        <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
          <button type="button" disabled={search.page === 0} aria-label="Halaman sebelumnya" onClick={() => go({ page: search.page - 1 })} className="min-h-9 rounded-lg border px-2.5 disabled:opacity-40">‹</button>
          <button type="button" disabled={!hasMore} aria-label="Halaman berikutnya" onClick={() => go({ page: search.page + 1 })} className="min-h-9 rounded-lg border px-2.5 disabled:opacity-40">›</button>
        </div>
      </div>
    </AdminShell>
  );
}
