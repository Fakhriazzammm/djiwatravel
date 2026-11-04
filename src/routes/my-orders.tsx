import { OrderLoading } from "@/components/order-loading";
import { BackBar, Page, btnPrimary } from "@/components/shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { effectiveOrderStatus, esimStatusBadge, type EsimBadgeTone } from "@/lib/esim-status";
import { useOrders } from "@/lib/orders";
import { rupiah } from "@/lib/pricing";
import { customerPreorderState } from "@/lib/esim-preorder";

export const Route = createFileRoute("/my-orders")({
  head: () => ({
    meta: [
      { title: "Pesanan saya — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MyOrders,
});

const DOT: Record<EsimBadgeTone, string> = {
  success: "bg-[#34C759]",
  warning: "bg-[#FF9F0A]",
  info: "bg-[#0A84FF]",
  danger: "bg-brand-red",
  muted: "bg-[#8E8E93]",
};

const TEXT: Record<EsimBadgeTone, string> = {
  success: "text-[#1E7A4D]",
  warning: "text-[#9A5B00]",
  info: "text-[#0057B8]",
  danger: "text-brand-red",
  muted: "text-muted-foreground",
};

/** Every order this customer owns (signed-in account plus guest orders held by this browser). */
function MyOrders() {
  const orders = useOrders();
  const sorted = orders ? [...orders].sort((a, b) => b.createdAt - a.createdAt) : null;

  return (
    <Page tabs={false}>
      <BackBar title="Pesanan saya" fallbackTo="/profile" />
      {sorted === null ? (
        <div className="mt-3">
          <OrderLoading list label="Memuat pesanan…" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-[14px] font-semibold">Belum ada pesanan</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Pesanan eSIM kamu akan muncul di sini.
          </p>
          <Link to="/explore" className={`${btnPrimary} mt-3`}>
            Cari Destinasi
          </Link>
        </div>
      ) : (
        <>
          <p className="px-3 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {sorted.length} pesanan
          </p>
          <section className="overflow-hidden rounded-2xl bg-surface" aria-label="Daftar pesanan">
            {sorted.map((o, index) => {
              const preorder = customerPreorderState({
                fulfillmentMode: o.fulfillmentMode,
                preorderStatus: o.preorderStatus,
                orderStatus: o.status,
              });
              const preorderLabels = {
                awaiting_payment: "Pre-order · menunggu pembayaran",
                awaiting_balance: "Pre-order · menunggu saldo",
                processing: "Pre-order · sedang diproses",
                refund_review: "Pre-order · ditinjau admin",
                fulfilled: "Pre-order · eSIM siap",
              } as const;
              const badge = preorder
                ? { label: preorderLabels[preorder], tone: "warning" as const }
                : esimStatusBadge(effectiveOrderStatus(o.status, o.expiresAt));
              const code = (o.publicOrderCode ?? o.id).slice(0, 6).toUpperCase();
              const date = new Date(o.createdAt).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              return (
                <Link
                  key={o.id}
                  to="/order/$id"
                  params={{ id: o.id }}
                  className={`tap flex min-h-12 items-center gap-2 px-3 py-2 ${index > 0 ? "border-t border-border/60" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold leading-tight">
                      {o.packageName ?? o.packageId}
                    </span>
                    <span className="block truncate text-[12px] leading-4 text-muted-foreground">
                      {rupiah(o.amount)} · {date} · #{code}
                    </span>
                    <span
                      className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium ${TEXT[badge.tone]}`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${DOT[badge.tone]}`}
                        aria-hidden="true"
                      />
                      {badge.label}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              );
            })}
          </section>
        </>
      )}
    </Page>
  );
}
