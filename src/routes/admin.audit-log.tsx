import { Eye, EyeOff, FileClock, RefreshCw } from "lucide-react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminPayments } from "@/lib/admin-read-model.server";
import { normalizePaymentQuery } from "@/lib/admin-metrics";
import {
  ageFrom,
  formatAdminDateTime,
  humanizeAdminStatus,
  projectAdminAmount,
  projectAdminIdentifier,
} from "@/lib/admin-display";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/audit-log")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: async () => ({
    events: await getAdminPayments({
      data: normalizePaymentQuery({ sort: "updatedAt", dir: "desc", pageSize: 30 }),
    }),
  }),
  component: Page,
});

/**
 * Audit trail of recorded payment/provider events.
 *
 * The events come from the same masked, privacy-projected read model the Payments screen uses, so no
 * raw provider payload, customer contact or secret can reach this page. Order-level detail links stay
 * behind admin auth like every other console route.
 */
function Page() {
  const { events } = Route.useLoaderData();
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    await router.invalidate();
    setBusy(false);
  };

  return (
    <AdminShell title="Audit log" subtitle="Recorded payment & provider events">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeading
            title="Peristiwa tercatat"
            detail="Status pembayaran, error pemrosesan, dan referensi ter-mask. Payload mentah tidak pernah ditampilkan."
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHidden((value) => !value)}
              aria-pressed={hidden}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 text-xs font-semibold"
            >
              {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {hidden ? "Tampilkan" : "Sembunyikan"}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
              Muat
            </button>
          </div>
        </div>

        <AdminSurface className="p-3">
          {events.rows.length === 0 ? (
            <div className="flex items-start gap-3 p-1">
              <FileClock className="mt-0.5 size-5 shrink-0 text-[#8a8a8e]" />
              <div>
                <p className="text-sm font-semibold">Belum ada peristiwa tercatat</p>
                <p className="mt-1 text-xs text-[#6e6e73]">
                  Log terisi otomatis saat webhook pembayaran atau provider diterima.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#f0f0f2]">
              {events.rows.map((event) => (
                <Link
                  key={event.displayIdentifier}
                  to={event.detailHref}
                  className="flex min-h-16 items-center gap-3 py-2.5"
                >
                  <span className="rounded-xl bg-[#f7f7f8] p-2">
                    <FileClock className="size-4 text-[#0a84ff]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {projectAdminIdentifier(event.displayIdentifier, hidden)} ·{" "}
                      {humanizeAdminStatus(event.status)}
                    </p>
                    <p className="truncate text-xs text-[#8e8e93]">
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
          )}
        </AdminSurface>

        <p className="px-1 text-xs text-[#8e8e93]">
          Menampilkan {events.rows.length} dari {events.total} peristiwa terbaru.
        </p>
      </div>
    </AdminShell>
  );
}
