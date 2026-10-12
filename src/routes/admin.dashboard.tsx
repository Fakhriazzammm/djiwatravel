import {
  AlertTriangle,
  ArrowRight,
  CircleAlert,
  Clock3,
  CreditCard,
  Database,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminDashboard } from "@/lib/admin-read-model.server";
import { AdminPageState, AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/dashboard")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminDashboard(),
  component: AdminDashboard,
});
const exceptions = [
  ["Order baru", "Order yang perlu diproses", "orders", Clock3, "neutral"],
  [
    "Pembayaran pending/gagal",
    "Periksa status invoice dan webhook",
    "payments",
    CreditCard,
    "warn",
  ],
  [
    "Sudah bayar, eSIM belum siap",
    "Paid tanpa profile READY",
    "provisioning",
    ShieldAlert,
    "danger",
  ],
  [
    "Provisioning gagal/stuck",
    "Job yang perlu investigasi",
    "provisioning",
    AlertTriangle,
    "danger",
  ],
  ["Masalah provider", "Readiness payment dan eSIM", "settings", Database, "warn"],
] as const;
function AdminDashboard() {
  const { counts, items } = Route.useLoaderData();
  const countByHref = {
    orders: counts.newOrders + counts.pendingOrders,
    payments: counts.paymentExceptions,
    provisioning: counts.failedProvisioning + counts.paidNotStarted,
    settings: 0,
  };
  return (
    <AdminShell
      title="Dashboard"
      subtitle="Hanya menampilkan hal yang perlu ditindaklanjuti operator."
    >
      <AdminPageState
        title="Read model operasional belum tersedia"
        detail="Dashboard hanya membaca tabel Travel yang tersedia. Payment exception berasal dari order dan payment webhook; data yang tidak tersedia tetap unknown."
      />
      <section
        className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Exception operasional"
      >
        {exceptions.map(([label, detail, href, Icon, tone]) => (
          <Link
            key={label}
            to={`/admin/${href}` as never}
            className="group rounded-2xl border border-[#e5e5ea] bg-white p-4 transition hover:border-[#b9d7ff] focus:outline-none focus:ring-2 focus:ring-[#0a84ff]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-xl bg-[#f4f4f5] p-2">
                <Icon className="size-4 text-[#6b6b72]" />
              </span>
              <StatusPill tone={tone}>
                {href === "settings"
                  ? "Readiness"
                  : `${countByHref[href as keyof typeof countByHref]} exception`}
              </StatusPill>
            </div>
            <h2 className="mt-4 text-sm font-semibold">{label}</h2>
            <p className="mt-1 text-xs leading-5 text-[#8a8a91]">{detail}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#0a67c7]">
              Buka area <ArrowRight className="size-3 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>
      <section className="mt-6 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <SectionHeading
          title="Exception terbaru"
          detail="Record terbaru dari database; detail sensitif tetap di route detail yang dilindungi."
        />
        {items.length === 0 ? (
          <p className="mt-5 text-sm text-[#6b6b72]">Tidak ada exception aktif.</p>
        ) : (
          <div className="mt-4 divide-y">
            {items.map((item) => (
              <a
                key={`${item.kind}-${item.id}`}
                href={item.kind === "payment" ? "/admin/payments" : `/admin/orders/${item.id}`}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <span className="font-semibold text-[#0a67c7]">{item.publicOrderCode}</span>
                <span className="text-[#6b6b72]">
                  {item.kind} · {item.status}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-[#e5e5ea] bg-white p-5">
          <SectionHeading
            title="Prioritas hari ini"
            detail="Urutan kerja berdasarkan exception, bukan KPI dekoratif."
          />
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm text-[#6b6b72]">
            <CircleAlert className="size-5 shrink-0 text-[#b87400]" />
            Belum ada data untuk menentukan prioritas.
          </div>
        </article>
        <article className="rounded-2xl border border-[#e5e5ea] bg-white p-5">
          <SectionHeading
            title="Status sinkronisasi"
            detail="Sumber terakhir dan freshness akan muncul di sini."
          />
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#fafafa] p-4 text-sm text-[#6b6b72]">
            <LoaderCircle className="size-5 shrink-0 text-[#8a8a91]" />
            Last sync belum tersedia.
          </div>
        </article>
      </section>
    </AdminShell>
  );
}
