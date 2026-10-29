import { ArrowLeft, CircleCheck, CircleDashed, ShieldAlert } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminOrderDetail } from "@/lib/admin-read-model.server";
import {
  formatAdminDateTime,
  humanizeAdminStatus,
  projectAdminAmount,
  projectAdminCount,
  projectAdminCustomer,
  projectAdminIdentifier,
  projectAdminPrivacy,
} from "@/lib/admin-display";
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
  const [privateMode, setPrivateMode] = useState(false);
  if (!order)
    return (
      <AdminShell title="Detail order">
        <Link
          to="/admin/orders"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-red"
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
      subtitle={`Order ${projectAdminIdentifier(order.displayIdentifier, privateMode)}`}
    >
      <Link
        to="/admin/orders"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-red"
      >
        <ArrowLeft className="size-4" />
        Kembali ke orders
      </Link>
      <button
        type="button"
        onClick={() => setPrivateMode((value) => !value)}
        aria-pressed={privateMode}
        className="mb-5 ml-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
      >
        {privateMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />} Privasi
      </button>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-2xl border border-border bg-surface p-5">
          <SectionHeading
            title="Lifecycle timeline"
            detail="Status berasal dari order, payment webhook, provisioning, dan provider webhook yang tersedia."
          />
          <ol className="mt-6 max-h-[42dvh] space-y-5 overflow-y-auto overscroll-contain lg:max-h-none">
            {milestones.map((step) => (
              <li key={step.label} className="flex items-center gap-3">
                <span
                  className={`flex size-5 items-center justify-center rounded-full ${step.done ? "text-success" : "text-muted-foreground"}`}
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
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatAdminDateTime(step.at)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-5">
          <SectionHeading
            title="Read model"
            detail="Customer masked; no raw provider payload, QR/LPA, or activation secret."
          />
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Status</dt>
              <dd className="font-semibold">{humanizeAdminStatus(order.status)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Customer</dt>
              <dd className="text-right">
                <div>{projectAdminCustomer(order.customer, privateMode).label}</div>
                {projectAdminCustomer(order.customer, privateMode).email && (
                  <div className="text-xs text-muted-foreground">
                    {projectAdminCustomer(order.customer, privateMode).email}
                  </div>
                )}
                {projectAdminCustomer(order.customer, privateMode).whatsapp && (
                  <div className="text-xs text-muted-foreground">
                    WA {projectAdminCustomer(order.customer, privateMode).whatsapp}
                  </div>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Total</dt>
              <dd>
                {projectAdminAmount(
                  order.totalAmount,
                  privateMode ? null : order.currencyCode,
                  privateMode,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Dibuat</dt>
              <dd>{formatAdminDateTime(order.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Diperbarui</dt>
              <dd>{formatAdminDateTime(order.updatedAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Status payment</dt>
              <dd>{humanizeAdminStatus(order.payment.status)}</dd>
            </div>
            {order.payment.reference && (
              <div className="flex justify-between gap-3">
                <dt>Payment reference</dt>
                <dd className="max-w-[55%] truncate">
                  {projectAdminPrivacy(order.payment.reference, privateMode)}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt>Provisioning</dt>
              <dd>{order.provisioning.status ?? "none"}</dd>
            </div>
          </dl>
          {order.provisioning.lastError && (
            <div className="mt-5 flex gap-3 rounded-xl bg-[#fffaf0] p-4 text-xs leading-5 text-muted-foreground">
              <ShieldAlert className="size-4 shrink-0 text-[#b87400]" />
              {order.provisioning.lastError}
            </div>
          )}
        </article>
      </div>
      <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <SectionHeading title="Order items" detail="Snapshot harga dan paket dari order." />
        <div className="mt-4 max-h-56 divide-y overflow-y-auto overscroll-contain lg:max-h-none">
          {order.items.map((item, index) => (
            <div key={`${item.packageName}-${index}`} className="flex justify-between py-3 text-sm">
              <span>
                {projectAdminPrivacy(item.packageName, privateMode)} ×{" "}
                {projectAdminCount(item.quantity, privateMode)}
              </span>
              <span>
                {projectAdminAmount(
                  item.lineTotal,
                  privateMode ? null : order.currencyCode,
                  privateMode,
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <SectionHeading
          title="Payment webhook evidence"
          detail="Intent/reconciliation fields are not assumed; only Travel payment webhook records are shown."
        />
        {order.payment.webhooks.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No payment webhook evidence recorded.</p>
        ) : (
          <div className="mt-4 max-h-56 divide-y overflow-y-auto overscroll-contain lg:max-h-none">
            {order.payment.webhooks.map((event) => (
              <div key={`${event.eventType}-${event.createdAt}`} className="py-3 text-sm">
                <p className="font-semibold">
                  {event.eventType ?? "event unknown"} · {event.status ?? "status unknown"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {projectAdminAmount(
                    event.amount,
                    privateMode ? null : event.currencyCode,
                    privateMode,
                  )}
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
