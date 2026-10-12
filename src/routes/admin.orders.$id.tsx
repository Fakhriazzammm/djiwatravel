import { ArrowLeft, CircleCheck, CircleDashed, ShieldAlert } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminOrderDetail } from "@/lib/admin-read-model.server";
import { AdminPageState, AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/orders/$id")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: ({ params }) => getAdminOrderDetail({ data: { id: params.id } }),
  component: AdminOrderDetail,
});
function AdminOrderDetail() {
  const { id } = Route.useParams();
  const order = Route.useLoaderData();
  if (!order)
    return (
      <AdminShell title="Detail order">
        <Link
          to="/admin/orders"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0a67c7]"
        >
          <ArrowLeft className="size-4" />
          Kembali ke orders
        </Link>
        <AdminPageState
          title="Order tidak ditemukan"
          detail="Tidak ada record dengan ID tersebut pada database Travel."
        />
      </AdminShell>
    );
  const milestones = [
    { label: "Order dibuat", done: true, at: order.createdAt },
    {
      label: "Pembayaran",
      done:
        Boolean(order.paidAt) ||
        ["PAYMENT_CONFIRMED", "PROVISIONING", "READY", "INSTALLED"].includes(order.status),
      at: order.paidAt,
    },
    {
      label: "Provisioning",
      done:
        ["PROVISIONING", "READY", "INSTALLED"].includes(order.status) ||
        Boolean(order.provisioning.status),
      at: order.provisioning.createdAt,
    },
    {
      label: "eSIM siap",
      done: ["READY", "INSTALLED"].includes(order.status),
      at: order.esimActivationExpiresAt,
    },
    { label: "Selesai", done: order.status === "INSTALLED", at: null },
  ];
  return (
    <AdminShell
      title="Detail order"
      subtitle={`Order ${order.publicOrderCode} · data sensitif tetap masked.`}
    >
      <Link
        to="/admin/orders"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0a67c7]"
      >
        <ArrowLeft className="size-4" />
        Kembali ke orders
      </Link>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-2xl border border-[#e5e5ea] bg-white p-5">
          <SectionHeading
            title="Lifecycle timeline"
            detail="Status berasal dari order, payment webhook, provisioning, dan provider webhook yang tersedia."
          />
          <ol className="mt-6 space-y-5">
            {milestones.map((step) => (
              <li key={step.label} className="flex items-center gap-3">
                <span
                  className={`flex size-5 items-center justify-center rounded-full ${step.done ? "text-[#248a3d]" : "text-[#a1a1a8]"}`}
                >
                  {step.done ? (
                    <CircleCheck className="size-5" />
                  ) : (
                    <CircleDashed className="size-5" />
                  )}
                </span>
                <span className="text-sm font-medium">{step.label}</span>
                {step.done && <StatusPill tone="good">Tercatat</StatusPill>}
                {step.at && (
                  <span className="ml-auto text-xs text-[#8a8a91]">
                    {new Date(step.at).toLocaleString("id-ID")}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </article>
        <article className="rounded-2xl border border-[#e5e5ea] bg-white p-5">
          <SectionHeading
            title="Read model"
            detail="Customer masked; no raw provider payload, QR/LPA, or activation secret."
          />
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Status</dt>
              <dd className="font-semibold">{order.status}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Customer</dt>
              <dd>{order.customer ?? "masked unavailable"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Total</dt>
              <dd>
                {order.currencyCode} {order.totalAmount.toLocaleString("id-ID")}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Payment evidence</dt>
              <dd>{order.payment.status ?? "unknown (no payment webhook evidence)"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Provisioning</dt>
              <dd>{order.provisioning.status ?? "none"}</dd>
            </div>
          </dl>
          {order.provisioning.lastError && (
            <div className="mt-5 flex gap-3 rounded-xl bg-[#fffaf0] p-4 text-xs leading-5 text-[#6b6b72]">
              <ShieldAlert className="size-4 shrink-0 text-[#b87400]" />
              {order.provisioning.lastError}
            </div>
          )}
        </article>
      </div>
      <section className="mt-4 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <SectionHeading title="Order items" detail="Snapshot harga dan paket dari order." />
        <div className="mt-4 divide-y">
          {order.items.map((item, index) => (
            <div key={`${item.packageName}-${index}`} className="flex justify-between py-3 text-sm">
              <span>
                {item.packageName} × {item.quantity}
              </span>
              <span>
                {order.currencyCode} {item.lineTotal.toLocaleString("id-ID")}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-4 rounded-2xl border border-[#e5e5ea] bg-white p-5">
        <SectionHeading
          title="Payment webhook evidence"
          detail="Intent/reconciliation fields are not assumed; only Travel payment webhook records are shown."
        />
        {order.payment.webhooks.length === 0 ? (
          <p className="mt-4 text-sm text-[#6b6b72]">No payment webhook evidence recorded.</p>
        ) : (
          <div className="mt-4 divide-y">
            {order.payment.webhooks.map((event) => (
              <div key={`${event.eventId}-${event.createdAt}`} className="py-3 text-sm">
                <p className="font-semibold">
                  {event.eventType ?? "event unknown"} · {event.status ?? "status unknown"}
                </p>
                <p className="mt-1 text-xs text-[#6b6b72]">
                  {event.currencyCode ?? "currency unknown"}{" "}
                  {event.amount?.toLocaleString("id-ID") ?? "amount unknown"}
                  {event.processingError ? ` · ${event.processingError}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
