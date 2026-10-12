import { ArrowLeft, CircleCheck, CircleDashed, CircleDot, ShieldAlert } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import {
  AdminPageState,
  AdminShell,
  DisabledSafeAction,
  SectionHeading,
  StatusPill,
} from "@/components/admin-shell";

export const Route = createFileRoute("/admin/orders/$id")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AdminOrderDetail,
});
const timeline = [
  ["Order dibuat", CircleCheck],
  ["Pembayaran", CircleDot],
  ["Provisioning", CircleDashed],
  ["eSIM siap", CircleDashed],
  ["Selesai", CircleDashed],
] as const;
function AdminOrderDetail() {
  const { id } = Route.useParams();
  return (
    <AdminShell title="Detail order" subtitle={`Order ${id} · data sensitif tetap masked.`}>
      <Link
        to="/admin/orders"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0a67c7]"
      >
        <ArrowLeft className="size-4" />
        Kembali ke orders
      </Link>
      <AdminPageState
        title="Detail order belum tersedia"
        detail="Loader order server-side belum terhubung. Jangan gunakan halaman ini untuk menyimpulkan payment atau provisioning."
      />
      <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-2xl border border-[#e5e5ea] bg-white p-5">
          <SectionHeading
            title="Timeline lifecycle"
            detail="Order dibuat → Pembayaran → Provisioning → eSIM siap → Selesai"
          />
          <ol className="mt-6 space-y-5">
            {timeline.map(([label, Icon], index) => (
              <li key={label} className="flex items-center gap-3">
                <Icon className={`size-5 ${index === 0 ? "text-[#248a3d]" : "text-[#a1a1a8]"}`} />
                <span className="text-sm font-medium">{label}</span>
                {index === 0 && <StatusPill tone="good">Tercatat</StatusPill>}
              </li>
            ))}
          </ol>
        </article>
        <article className="rounded-2xl border border-[#e5e5ea] bg-white p-5">
          <SectionHeading
            title="Aksi aman"
            detail="Tidak ada aksi aktif tanpa kontrak backend dan permission."
          />
          <div className="mt-5 flex flex-wrap gap-2">
            <DisabledSafeAction>Cek ulang pembayaran</DisabledSafeAction>
            <DisabledSafeAction>Retry provisioning</DisabledSafeAction>
            <DisabledSafeAction>Reconcile status</DisabledSafeAction>
            <DisabledSafeAction>Buka kasus support</DisabledSafeAction>
          </div>
          <div className="mt-5 flex gap-3 rounded-xl bg-[#fffaf0] p-4 text-xs leading-5 text-[#6b6b72]">
            <ShieldAlert className="size-4 shrink-0 text-[#b87400]" />
            Tidak ada tombol Mark as Paid dan tidak ada reveal QR/LPA atau activation secret.
          </div>
        </article>
      </section>
    </AdminShell>
  );
}
