import { CircleX, LoaderCircle, ShieldCheck } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminProvisioning } from "@/lib/admin-read-model.server";
import { formatAdminDateTime, humanizeAdminStatus } from "@/lib/admin-display";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/provisioning")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminProvisioning(),
  component: AdminProvisioning,
});
function AdminProvisioning() {
  const queue = Route.useLoaderData();
  return (
    <AdminShell
      title="eSIM / Provisioning"
      subtitle="Satu queue untuk paid order yang belum selesai sampai eSIM siap."
    >
      <section className="mt-6 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            title="Queue status"
            detail="Provider order number, payload, QR, LPA, dan activation secret tidak dikirim ke browser."
          />
          <StatusPill>{queue.length} queue</StatusPill>
        </div>
        {queue.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed p-10 text-center text-sm text-[#6b6b72]">
            Tidak ada provisioning exception dari database Travel.
          </div>
        ) : (
          <div className="mt-5 divide-y">
            {queue.map((item) => {
              const Icon =
                item.status === "FAILED"
                  ? CircleX
                  : item.status === "PROVISIONING"
                    ? LoaderCircle
                    : ShieldCheck;
              return (
                <div key={item.id} className="flex items-center gap-3 py-4">
                  <Icon className="size-5 shrink-0 text-[#8a8a91]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {item.publicOrderCode} · {humanizeAdminStatus(item.status)}
                    </p>
                    <p className="mt-1 text-xs text-[#6b6b72]">{item.customer.label}</p>
                    <p className="mt-1 text-xs text-[#6b6b72]">
                      Order {humanizeAdminStatus(item.orderStatus)} · attempts{" "}
                      {item.provisioningAttempts} · update {formatAdminDateTime(item.updatedAt)}
                    </p>
                    {item.lastError && (
                      <p className="mt-1 text-xs text-[#b00020]">{item.lastError}</p>
                    )}
                  </div>
                  <StatusPill tone={item.status === "FAILED" ? "danger" : "warn"}>
                    {item.providerStatus ?? "provider status unavailable"}
                  </StatusPill>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
