import { CreditCard } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { AdminPageState, AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/payments")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AdminPayments,
});
const states = [
  ["Pending", "Menunggu konfirmasi provider", "warn"],
  ["Berhasil", "Payment terverifikasi", "good"],
  ["Gagal", "Payment gagal", "danger"],
  ["Expired", "Invoice kedaluwarsa", "neutral"],
  ["Amount mismatch", "Nominal provider berbeda", "danger"],
  ["Webhook bermasalah", "Event tidak terselesaikan", "danger"],
] as const;
function AdminPayments() {
  return (
    <AdminShell
      title="Payments"
      subtitle="Cari pembayaran bermasalah tanpa mengubah status secara manual."
    >
      <AdminPageState
        title="Data payment belum tersambung"
        detail="Status hanya boleh berasal dari payment intent dan webhook yang diverifikasi server-side. Tombol Mark as Paid tidak tersedia."
      />
      <section className="mt-6 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <SectionHeading
          title="Filter exception payment"
          detail="Pending, berhasil, gagal, expired, mismatch, dan webhook problem."
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {states.map(([label, detail, tone]) => (
            <button
              key={label}
              type="button"
              disabled
              className="flex min-h-20 cursor-not-allowed items-center gap-3 rounded-xl border border-[#e5e5ea] p-4 text-left opacity-80"
            >
              <CreditCard className="size-5 shrink-0 text-[#8a8a91]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-1 block text-xs text-[#8a8a91]">{detail}</span>
              </span>
              <StatusPill tone={tone}>Belum tersedia</StatusPill>
            </button>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
