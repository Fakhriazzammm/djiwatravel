import { CircleX, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminProvisioning } from "@/lib/admin-read-model.server";
import {
  formatAdminDateTime,
  humanizeAdminStatus,
  projectAdminCount,
  projectAdminCustomer,
  projectAdminPrivacy,
} from "@/lib/admin-display";
import {
  AdminDetailSheet,
  AdminShell,
  AdminSurface,
  SectionHeading,
  StatusPill,
} from "@/components/admin-shell";
export const Route = createFileRoute("/admin/provisioning")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminProvisioning(),
  component: AdminProvisioning,
});
function AdminProvisioning() {
  const queue = Route.useLoaderData();
  const [privateMode, setPrivateMode] = useState(false);
  const [open, setOpen] = useState(false);
  const failed = queue.filter((x) => x.status === "FAILED").length;
  const active = queue.filter((x) => x.status === "PROVISIONING").length;
  const ready = queue.filter((x) => x.status === "READY").length;
  const item = (x: (typeof queue)[number]) => {
    const Icon =
      x.status === "FAILED" ? CircleX : x.status === "PROVISIONING" ? LoaderCircle : ShieldCheck;
    return (
      <Link to={x.detailHref as never} className="block rounded-xl bg-secondary p-2.5 text-xs">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <b className="min-w-0 flex-1 truncate">
            {projectAdminPrivacy(x.displayIdentifier, privateMode)}
          </b>
          <StatusPill
            tone={x.status === "FAILED" ? "danger" : x.status === "READY" ? "good" : "warn"}
          >
            {humanizeAdminStatus(x.status)}
          </StatusPill>
        </div>
        <p className="mt-1 text-muted-foreground">
          {projectAdminCustomer(x.customer, privateMode).label} ·{" "}
          {projectAdminCount(x.provisioningAttempts, privateMode)} percobaan ·{" "}
          {formatAdminDateTime(x.updatedAt)}
        </p>
        {x.lastError && (
          <p className="mt-1 truncate text-destructive">
            {projectAdminPrivacy(x.lastError, privateMode)}
          </p>
        )}
      </Link>
    );
  };
  return (
    <AdminShell title="Provisioning" subtitle="Queue eSIM Travel">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeading
            title="Queue status"
            detail="Payload provider dan secret tidak dikirim ke browser."
          />
          <button
            type="button"
            onClick={() => setPrivateMode((v) => !v)}
            aria-pressed={privateMode}
            className="min-h-11 min-w-11 rounded-xl border bg-surface p-2"
          >
            {privateMode ? (
              <EyeOff className="mx-auto size-4" />
            ) : (
              <Eye className="mx-auto size-4" />
            )}
          </button>
        </div>
        <AdminSurface className="p-3">
          <div className="grid grid-cols-2 divide-x divide-y divide-black/[0.06] sm:grid-cols-4">
            <div className="p-2">
              <p className="text-[11px] text-muted-foreground">Total queue</p>
              <b className="text-xl">{privateMode ? "••••" : queue.length}</b>
            </div>
            <div className="p-2">
              <p className="text-[11px] text-muted-foreground">Gagal</p>
              <b className="text-xl text-destructive">{privateMode ? "••••" : failed}</b>
            </div>
            <div className="p-2">
              <p className="text-[11px] text-muted-foreground">Berjalan</p>
              <b className="text-xl">{privateMode ? "••••" : active}</b>
            </div>
            <div className="p-2">
              <p className="text-[11px] text-muted-foreground">Siap</p>
              <b className="text-xl text-success">{privateMode ? "••••" : ready}</b>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span>
              {queue.length
                ? `Terbaru ${formatAdminDateTime(queue[0]?.updatedAt ?? "")}`
                : "Queue kosong"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="min-h-11 rounded-xl bg-brand-red px-3 font-semibold text-white"
            >
              Lihat queue
            </button>
          </div>
        </AdminSurface>
        <AdminSurface className="hidden p-3 lg:block">
          <div className="space-y-2">{queue.map(item)}</div>
        </AdminSurface>
        {!queue.length && (
          <AdminSurface className="p-4 text-sm text-muted-foreground">
            Tidak ada provisioning exception dari database Travel.
          </AdminSurface>
        )}
      </div>
      <AdminDetailSheet
        open={open}
        title={`Queue provisioning · ${queue.length}`}
        onClose={() => setOpen(false)}
      >
        <div className="space-y-2">{queue.map(item)}</div>
      </AdminDetailSheet>
    </AdminShell>
  );
}
