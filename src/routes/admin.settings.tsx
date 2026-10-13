import { CircleAlert, Database, Server } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { AdminPageState, AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";
import { getAdminReadiness } from "@/lib/admin-readiness.server";

export const Route = createFileRoute("/admin/settings")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: async () => ({ readiness: await getAdminReadiness() }),
  component: AdminSettings,
});
function AdminSettings() {
  const { readiness } = Route.useLoaderData();
  return (
    <AdminShell
      title="Settings"
      subtitle="Readiness sistem saja. Credential, secret, pricing, dan maintenance dikelola di server/platform."
    >
      <AdminPageState
        title="Server readiness"
        detail="Status berikut dibaca server-side dari konfigurasi readiness. Secret tidak pernah dikirim ke browser."
      />
      <section className="mt-6 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <SectionHeading
          title="System readiness"
          detail="Tidak ada credential atau konfigurasi bisnis yang dapat diedit di sini."
        />
        <div className="mt-5 divide-y divide-[#f0f0f2]">
          {readiness.map((item) => (
            <div key={item.name} className="flex min-h-16 items-center gap-3 py-3">
              <span className="rounded-xl bg-[#f4f4f5] p-2">
                {item.ready ? (
                  <Database className="size-4 text-[#248a3d]" />
                ) : (
                  <Server className="size-4 text-[#8a8a91]" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="mt-1 text-xs text-[#8a8a91]">{item.detail}</p>
              </div>
              <StatusPill tone={item.ready ? "good" : "warn"}>
                {item.ready ? "Ready" : "Belum tersedia"}
              </StatusPill>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-4 flex gap-3 rounded-2xl border border-[#e5e5ea] bg-white p-5 text-sm text-[#6b6b72]">
        <CircleAlert className="size-5 shrink-0 text-[#b87400]" />
        <p>
          Error terakhir dan correlation ID hanya ditampilkan setelah observability read model
          tersedia. Secret dan raw provider payload tidak pernah ditampilkan.
        </p>
      </section>
    </AdminShell>
  );
}
