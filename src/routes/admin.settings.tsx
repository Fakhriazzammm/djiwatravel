import { CircleAlert, Database, Server } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import {
  AdminDetailSheet,
  AdminShell,
  AdminSurface,
  SectionHeading,
  StatusPill,
} from "@/components/admin-shell";
import { getAdminReadiness } from "@/lib/admin-readiness.server";
import { useState } from "react";
export const Route = createFileRoute("/admin/settings")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: async () => ({ readiness: await getAdminReadiness() }),
  component: AdminSettings,
});
function AdminSettings() {
  const { readiness } = Route.useLoaderData();
  const [open, setOpen] = useState(false);
  const ready = readiness.filter((x) => x.ready).length;
  return (
    <AdminShell title="Settings" subtitle="Server readiness">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeading
            title="System readiness"
            detail="Credential, secret, pricing, dan maintenance tetap di server."
          />
          <StatusPill tone={ready === readiness.length ? "good" : "warn"}>
            {ready}/{readiness.length} ready
          </StatusPill>
        </div>
        <AdminSurface className="p-3">
          <div className="grid grid-cols-2 divide-x divide-black/[0.06] sm:grid-cols-3">
            <div className="p-2">
              <p className="text-[11px] text-[#6e6e73]">Ready</p>
              <b className="text-xl">{ready}</b>
            </div>
            <div className="p-2">
              <p className="text-[11px] text-[#6e6e73]">Belum tersedia</p>
              <b className="text-xl">{readiness.length - ready}</b>
            </div>
            <div className="p-2">
              <p className="text-[11px] text-[#6e6e73]">Last check</p>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-1 min-h-11 rounded-xl bg-[#0a84ff] px-3 text-xs font-semibold text-white"
              >
                Lihat detail
              </button>
            </div>
          </div>
        </AdminSurface>
        <AdminSurface className="hidden p-3 lg:block">
          <div className="divide-y divide-[#f0f0f2]">
            {readiness.map((item) => (
              <ReadinessRow key={item.name} item={item} />
            ))}
          </div>
        </AdminSurface>
      </div>
      <AdminDetailSheet open={open} title="System readiness" onClose={() => setOpen(false)}>
        <div className="divide-y divide-[#f0f0f2]">
          {readiness.map((item) => (
            <ReadinessRow key={item.name} item={item} />
          ))}
        </div>
        <div className="mt-3 flex gap-2 rounded-xl bg-[#fffaf0] p-3 text-xs text-[#6e6e73]">
          <CircleAlert className="size-4 shrink-0 text-[#b87400]" />
          <p>Secret dan raw provider payload tidak pernah ditampilkan.</p>
        </div>
      </AdminDetailSheet>
    </AdminShell>
  );
}
function ReadinessRow({ item }: { item: { name: string; ready: boolean; detail: string } }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-2">
      <span className="rounded-xl bg-[#f7f7f8] p-2">
        {item.ready ? (
          <Database className="size-4 text-[#248a3d]" />
        ) : (
          <Server className="size-4 text-[#8e8e93]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{item.name}</p>
        <p className="truncate text-xs text-[#8e8e93]">{item.detail}</p>
      </div>
      <StatusPill tone={item.ready ? "good" : "warn"}>
        {item.ready ? "Ready" : "Belum tersedia"}
      </StatusPill>
    </div>
  );
}
