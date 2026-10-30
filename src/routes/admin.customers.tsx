import { Search, UsersRound } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminCustomers } from "@/lib/admin-customers.fn";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime } from "@/lib/admin-display";

export const Route = createFileRoute("/admin/customers")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: (search) => ({ q: typeof search.q === "string" ? search.q : "" }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getAdminCustomers({ data: deps }),
  component: AdminCustomers,
});

function AdminCustomers() {
  const customers = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [draft, setDraft] = useState(search.q);
  return (
    <AdminShell title="Customers" subtitle="Profil customer dan ringkasan order tanpa membuka identitas sensitif.">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading title="Customer profiles" detail="Email, WhatsApp, dan auth subject tetap diproyeksikan secara ter-mask." />
          <StatusPill tone={customers.length ? "good" : "neutral"}>{customers.length} tampil</StatusPill>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void router.navigate({ to: "/admin/customers", search: { q: draft } } as never);
          }}
        >
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3">
            <Search className="size-4 text-muted-foreground" />
            <span className="sr-only">Cari customer</span>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Cari nama atau email" />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-brand-red px-4 text-sm font-semibold text-white">Cari</button>
        </form>
        <AdminSurface className="p-3">
          {customers.length === 0 ? (
            <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground"><UsersRound className="size-5" />Belum ada customer yang cocok.</div>
          ) : (
            <div className="divide-y divide-border">
              {customers.map((customer) => (
                <article key={customer.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="rounded-xl bg-secondary p-2"><UsersRound className="size-4 text-brand-red" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{customer.displayName ?? "Nama belum tersedia"}</p>
                    <p className="truncate text-xs text-muted-foreground">{customer.email} · {customer.whatsapp}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold">{customer.orderCount} order</p>
                    <p className="text-muted-foreground">Terakhir {formatAdminDateTime(customer.latestOrderAt)}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </AdminSurface>
      </div>
    </AdminShell>
  );
}
