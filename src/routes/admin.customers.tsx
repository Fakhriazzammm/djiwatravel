import { Search, UsersRound } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminCustomers } from "@/lib/admin-customers.fn";
import type { AdminCustomerKind, AdminCustomerRow } from "@/lib/admin-customers.server";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime } from "@/lib/admin-display";

const KINDS: AdminCustomerKind[] = ["all", "member", "guest", "noprofile"];
const PAGE = 50;

export const Route = createFileRoute("/admin/customers")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: (search) => {
    const limit = Number(search["limit"]);
    return {
      q: typeof search["q"] === "string" ? search["q"] : "",
      kind: KINDS.includes(search["kind"] as AdminCustomerKind)
        ? (search["kind"] as AdminCustomerKind)
        : ("all" as AdminCustomerKind),
      limit: Number.isInteger(limit) && limit >= PAGE ? limit : PAGE,
    };
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getAdminCustomers({ data: deps }),
  component: AdminCustomers,
});

function nameOf(customer: AdminCustomerRow) {
  if (customer.displayName) return customer.displayName;
  if (customer.kind === "guest") return "Tamu (tanpa akun)";
  return customer.profileComplete ? "Belum mengisi nama" : "Belum melengkapi profil";
}

function contactOf(customer: AdminCustomerRow) {
  const parts = [customer.email, customer.whatsapp].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Email dan WhatsApp belum tersimpan";
}

function AdminCustomers() {
  const { rows, total, counts } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [draft, setDraft] = useState(search.q);
  const go = (next: Partial<typeof search>) =>
    void router.navigate({
      to: "/admin/customers",
      search: { ...search, limit: PAGE, ...next },
    } as never);
  const filters: [AdminCustomerKind, string, number][] = [
    ["all", "Semua", counts.all],
    ["member", "Member", counts.member],
    ["guest", "Tamu", counts.guest],
    ["noprofile", "Tanpa profil", counts.noProfile],
  ];
  return (
    <AdminShell
      title="Customers"
      subtitle="Semua orang yang dikenal sistem: member (dengan atau tanpa profil) dan tamu. Kontak tetap ter-mask."
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading
            title="Customer"
            detail="Email, WhatsApp, dan akun tidak pernah ditampilkan utuh."
          />
          <StatusPill tone={total ? "good" : "neutral"}>
            {rows.length} dari {total} tampil
          </StatusPill>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            go({ q: draft });
          }}
        >
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3">
            <Search className="size-4 text-muted-foreground" />
            <span className="sr-only">Cari customer</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder="Cari nama atau email"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-brand-red px-4 text-sm font-semibold text-white"
          >
            Cari
          </button>
        </form>
        <div role="group" aria-label="Jenis customer" className="flex flex-wrap gap-1.5">
          {filters.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              aria-pressed={search.kind === id}
              onClick={() => go({ kind: id })}
              className={`min-h-9 rounded-full px-3 text-xs font-semibold ${search.kind === id ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}
            >
              {label} · {count}
            </button>
          ))}
        </div>
        <AdminSurface className="p-3">
          {rows.length === 0 ? (
            <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
              <UsersRound className="size-5" />
              Belum ada customer yang cocok.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((customer) => (
                <article key={customer.ref} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="rounded-xl bg-secondary p-2">
                    <UsersRound className="size-4 text-brand-red" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold">{nameOf(customer)}</p>
                      <StatusPill>{customer.kind === "guest" ? "Tamu" : "Member"}</StatusPill>
                      {customer.kind === "member" && !customer.profileComplete && (
                        <StatusPill tone="warn">Profil belum lengkap</StatusPill>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {contactOf(customer)} · #{customer.ref}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold">{customer.orderCount} order</p>
                    <p className="text-muted-foreground">
                      {customer.latestOrderAt
                        ? `Terakhir ${formatAdminDateTime(customer.latestOrderAt)}`
                        : "Belum pernah order"}
                    </p>
                    {(customer.tripCount > 0 || customer.feedPostCount > 0) && (
                      <p className="text-muted-foreground">
                        {customer.tripCount} perjalanan · {customer.feedPostCount} post Feeds
                      </p>
                    )}
                    {customer.lastActivityAt && (
                      <p className="text-muted-foreground">
                        Aktif {formatAdminDateTime(customer.lastActivityAt)}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </AdminSurface>
        {rows.length < total && (
          <button
            type="button"
            onClick={() => go({ limit: Math.min(search.limit + PAGE, 200) })}
            disabled={search.limit >= 200}
            className="min-h-11 w-full rounded-xl border border-border bg-surface text-sm font-semibold disabled:opacity-50"
          >
            {search.limit >= 200 ? "Persempit dengan pencarian" : "Tampilkan lebih banyak"}
          </button>
        )}
      </div>
    </AdminShell>
  );
}
