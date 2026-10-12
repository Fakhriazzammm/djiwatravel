import { ClipboardList } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { AdminPageState, AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/orders")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AdminOrders,
});
function AdminOrders() {
  return (
    <AdminShell title="Orders" subtitle="Satu daftar order untuk menelusuri payment sampai eSIM.">
      <AdminPageState />
      <section className="mt-6 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            title="Daftar order"
            detail="Order ID, customer masked, paket, nominal, status payment, status eSIM, dan waktu order."
          />
          <StatusPill>Belum tersedia</StatusPill>
        </div>
        <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d5d5da] px-5 py-12 text-center">
          <ClipboardList className="size-8 text-[#8a8a91]" />
          <p className="mt-3 text-sm font-semibold">Belum ada read model order</p>
          <p className="mt-1 max-w-md text-sm text-[#6b6b72]">
            Hubungkan sumber order server-side sebelum menampilkan record. Detail order tersedia
            lewat ID saat loader sudah siap.
          </p>
        </div>
      </section>
    </AdminShell>
  );
}
