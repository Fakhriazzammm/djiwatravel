import { CreditCard } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminPayments } from "@/lib/admin-read-model.server";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/payments")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminPayments(),
  component: AdminPayments,
});
function AdminPayments() {
  const payments = Route.useLoaderData();
  return (
    <AdminShell
      title="Payments"
      subtitle="Cari pembayaran bermasalah tanpa mengubah status secara manual."
    >
      <section className="mt-6 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            title="Payment exceptions"
            detail="Berasal dari payment intent dan webhook server-side; Mark as Paid tidak tersedia."
          />
          <StatusPill>{payments.length} exception</StatusPill>
        </div>
        {payments.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed p-10 text-center text-sm text-[#6b6b72]">
            Tidak ada payment exception dari database Travel.
          </div>
        ) : (
          <div className="mt-5 divide-y">
            {payments.map((payment) => (
              <div key={payment.id} className="flex items-center gap-3 py-4">
                <CreditCard className="size-5 shrink-0 text-[#b87400]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {payment.publicOrderCode} · {payment.status}
                  </p>
                  <p className="mt-1 text-xs text-[#6b6b72]">
                    {payment.currencyCode} {payment.amount.toLocaleString("id-ID")} · attempts{" "}
                    {payment.attemptCount}
                  </p>
                  {payment.lastError && (
                    <p className="mt-1 text-xs text-[#b00020]">{payment.lastError}</p>
                  )}
                </div>
                <StatusPill tone="danger">Exception</StatusPill>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
