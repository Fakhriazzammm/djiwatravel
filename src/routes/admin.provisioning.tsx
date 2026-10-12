import { CircleCheck, CircleX, LoaderCircle, ShieldCheck } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { AdminPageState, AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/provisioning")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AdminProvisioning,
});
const states = [
  ["Menunggu", "Paid tetapi belum diproses", LoaderCircle, "warn"],
  ["Diproses", "Worker sedang menjalankan job", LoaderCircle, "neutral"],
  ["Berhasil", "Profile READY", CircleCheck, "good"],
  ["Gagal", "Provisioning gagal", CircleX, "danger"],
  ["Perlu dicek", "Status provider belum pasti", ShieldCheck, "warn"],
] as const;
function AdminProvisioning() {
  return (
    <AdminShell
      title="eSIM / Provisioning"
      subtitle="Satu queue untuk paid order yang belum selesai sampai eSIM siap."
    >
      <AdminPageState
        title="Queue provisioning belum tersambung"
        detail="Retry dan cek status hanya akan aktif setelah kontrak backend provider-state-aware, idempotent, dan permissioned tersedia. QR/LPA tidak ditampilkan."
      />
      <section className="mt-6 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <SectionHeading
          title="Queue status"
          detail="Menunggu, diproses, berhasil, gagal, dan perlu dicek."
        />
        <div className="mt-5 divide-y divide-[#f0f0f2]">
          {states.map(([label, detail, Icon, tone]) => (
            <div key={label} className="flex min-h-16 items-center gap-3 py-3">
              <Icon className="size-5 shrink-0 text-[#8a8a91]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-1 text-xs text-[#8a8a91]">{detail}</p>
              </div>
              <StatusPill tone={tone}>Belum tersedia</StatusPill>
            </div>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
