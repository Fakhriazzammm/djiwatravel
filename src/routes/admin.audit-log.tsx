import { Eye, EyeOff, FileClock, RefreshCw, UserCog } from "lucide-react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminPayments } from "@/lib/admin-read-model.fn";
import { getAdminActions } from "@/lib/admin-audit.fn";
import { normalizePaymentQuery } from "@/lib/admin-metrics";
import {
  ageFrom,
  formatAdminDateTime,
  humanizeAdminStatus,
  projectAdminAmount,
  projectAdminIdentifier,
} from "@/lib/admin-display";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";

const auditSearch = z.object({
  tab: z.enum(["actions", "payments"]).default("actions"),
  page: z.coerce.number().int().min(0).max(200).default(0),
});

export const Route = createFileRoute("/admin/audit-log")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: auditSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({
    tab: deps.tab,
    actions: deps.tab === "actions" ? await getAdminActions({ data: { page: deps.page } }) : null,
    events:
      deps.tab === "payments"
        ? await getAdminPayments({
            data: normalizePaymentQuery({
              sort: "updatedAt",
              dir: "desc",
              page: deps.page,
              pageSize: 30,
            }),
          })
        : null,
  }),
  component: Page,
});

const ACTION_LABELS: Record<string, string> = {
  "refund.approve": "Refund disetujui",
  "refund.reject": "Refund ditolak",
  "support.reply": "Balasan support",
  "support.status": "Status support diubah",
  "provisioning.retry": "Retry provisioning",
  "finance.expense": "Pengeluaran dicatat",
};

/**
 * Two read-only trails: what admins did (admin_audit_logs) and what payment providers reported.
 * Both use masked projections, so no raw payload, customer contact, or secret reaches the browser.
 */
function Page() {
  const { tab, actions, events } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = (patch: Partial<z.infer<typeof auditSearch>>) =>
    void router.navigate({ to: "/admin/audit-log", search: { ...search, ...patch } } as never);
  const refresh = async () => {
    setBusy(true);
    try {
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  };
  const page = actions?.page ?? events?.page ?? 0;
  const hasMore = actions?.hasMore ?? events?.hasMore ?? false;
  const total = actions?.total ?? events?.total ?? 0;

  return (
    <AdminShell title="Audit log" subtitle="Aksi admin dan peristiwa pembayaran">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-xl bg-surface p-1 shadow-sm" role="group" aria-label="Jenis log">
            {(
              [
                ["actions", "Aksi admin"],
                ["payments", "Event pembayaran"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => go({ tab: key, page: 0 })}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${tab === key ? "bg-brand-red-soft text-brand-red" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {tab === "payments" && (
              <button
                type="button"
                onClick={() => setHidden((value) => !value)}
                aria-pressed={hidden}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold"
              >
                {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {hidden ? "Tampilkan" : "Sembunyikan"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
              Segarkan
            </button>
          </div>
        </div>

        <SectionHeading
          title={tab === "actions" ? "Aksi admin" : "Peristiwa pembayaran"}
          detail={
            tab === "actions"
              ? "Siapa mengubah apa: refund, support, provisioning, keuangan, dan pengaturan."
              : "Status pembayaran, error pemrosesan, dan referensi ter-mask."
          }
        />

        <AdminSurface className="p-3">
          {actions &&
            (actions.rows.length === 0 ? (
              <Empty title="Belum ada aksi admin tercatat" detail="Aksi baru akan muncul di sini." />
            ) : (
              <div className="divide-y divide-border">
                {actions.rows.map((row) => (
                  <div key={row.id} className="flex min-h-14 items-center gap-3 py-2.5">
                    <span className="rounded-xl bg-secondary p-2">
                      <UserCog className="size-4 text-brand-red" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {ACTION_LABELS[row.action] ?? row.action}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.actor} · {row.reason}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                      <p>{formatAdminDateTime(row.createdAt)}</p>
                      {row.entityType === "order" && row.entityId ? (
                        <Link
                          to={`/admin/orders/${row.entityId}` as never}
                          className="font-semibold text-brand-red"
                        >
                          Buka order
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          {events &&
            (events.rows.length === 0 ? (
              <Empty
                title="Belum ada peristiwa tercatat"
                detail="Log terisi otomatis saat webhook pembayaran atau provider diterima."
              />
            ) : (
              <div className="divide-y divide-border">
                {events.rows.map((event) => (
                  <Link
                    key={event.detailHref}
                    to={event.detailHref as never}
                    className="flex min-h-16 items-center gap-3 py-2.5"
                  >
                    <span className="rounded-xl bg-secondary p-2">
                      <FileClock className="size-4 text-brand-red" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {projectAdminIdentifier(event.displayIdentifier, hidden)} ·{" "}
                        {humanizeAdminStatus(event.status)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatAdminDateTime(event.createdAt)} · {ageFrom(event.createdAt)} lalu
                        {event.eventType ? ` · ${event.eventType}` : ""}
                      </p>
                      {event.lastError && (
                        <p className="truncate text-xs text-[#b87400]">Error: {event.lastError}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {projectAdminAmount(event.amount, event.currencyCode, hidden)}
                      </p>
                      <StatusPill tone={event.lastError ? "warn" : "good"}>
                        {event.lastError ? "Perlu tindak lanjut" : "Tercatat"}
                      </StatusPill>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              Halaman {page + 1} · {total} total
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={page === 0}
                aria-label="Halaman sebelumnya"
                onClick={() => go({ page: page - 1 })}
                className="min-h-9 rounded-lg border px-2.5 disabled:opacity-40"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={!hasMore}
                aria-label="Halaman berikutnya"
                onClick={() => go({ page: page + 1 })}
                className="min-h-9 rounded-lg border px-2.5 disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </AdminSurface>
      </div>
    </AdminShell>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 p-1">
      <FileClock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
