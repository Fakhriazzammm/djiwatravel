import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminCustomerDetail } from "@/lib/admin-customers.fn";
import { formatAdminDateTime } from "@/lib/admin-display";

export const Route = createFileRoute("/admin/customer/$id")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: ({ params }) => getAdminCustomerDetail({ data: { id: params.id } }),
  component: AdminCustomerDetail,
});

const PURPOSE: Record<string, string> = {
  community: "Komunitas",
  ai: "Asisten Travo (AI)",
  personalization: "Personalisasi",
  promo: "Kabar & promo",
};

const GENDER: Record<string, string> = {
  female: "Perempuan",
  male: "Laki-laki",
  unspecified: "Tidak disebut",
};

function money(total: string, currency: string) {
  const value = Number(total);
  return currency === "IDR"
    ? new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(value)
    : `${total} ${currency}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children ?? "—"}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

function AdminCustomerDetail() {
  const customer = Route.useLoaderData();
  if (!customer)
    return (
      <AdminShell title="Customer" subtitle="Detail pelanggan">
        <AdminSurface className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">Customer tidak ditemukan.</p>
          <Link
            to="/admin/customers"
            search={{ q: "", kind: "all", limit: 50 }}
            className="text-sm font-semibold text-brand-red"
          >
            Kembali ke daftar
          </Link>
        </AdminSurface>
      </AdminShell>
    );
  const digits = (customer.whatsapp ?? "").replace(/\D/g, "");
  const name =
    customer.displayName ??
    (customer.kind === "guest" ? "Tamu (tanpa akun)" : "Belum mengisi nama");
  return (
    <AdminShell
      title={name}
      subtitle="Semua data yang tersimpan untuk customer ini. Setiap pembukaan halaman ini tercatat di audit log."
    >
      <div className="space-y-3">
        <Link
          to="/admin/customers"
          search={{ q: "", kind: "all", limit: 50 }}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Semua customer
        </Link>

        <AdminSurface className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-secondary p-2">
              <UserRound className="size-5 text-brand-red" />
            </span>
            <h2 className="text-base font-semibold">{name}</h2>
            <StatusPill>{customer.kind === "guest" ? "Tamu" : "Member"}</StatusPill>
            {customer.kind === "member" && !customer.profile && (
              <StatusPill tone="warn">Profil belum lengkap</StatusPill>
            )}
          </div>
          <dl className="mt-2 divide-y divide-border">
            <Field label="Email">
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="text-brand-red">
                  {customer.email}
                </a>
              ) : (
                "Belum tersimpan"
              )}
            </Field>
            <Field label="WhatsApp">
              {customer.whatsapp ? (
                <span className="inline-flex items-center gap-2">
                  {customer.whatsapp}
                  {digits && (
                    <a
                      href={`https://wa.me/${digits}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Buka WhatsApp"
                      className="inline-flex size-7 items-center justify-center rounded-full bg-secondary"
                    >
                      <MessageCircle className="size-4 text-brand-red" aria-hidden="true" />
                    </a>
                  )}
                </span>
              ) : (
                "Belum tersimpan"
              )}
            </Field>
            <Field label="ID akun">
              <span className="font-mono text-xs">{customer.id}</span>
            </Field>
            {customer.profile && (
              <>
                <Field label="Kewarganegaraan">{customer.profile.nationality}</Field>
                <Field label="Tanggal lahir">{customer.profile.dateOfBirth}</Field>
                <Field label="Jenis kelamin">
                  {customer.profile.gender
                    ? (GENDER[customer.profile.gender] ?? customer.profile.gender)
                    : null}
                </Field>
                <Field label="Profil dibuat">
                  {formatAdminDateTime(customer.profile.createdAt)}
                </Field>
                <Field label="Profil diubah">
                  {formatAdminDateTime(customer.profile.updatedAt)}
                </Field>
              </>
            )}
          </dl>
        </AdminSurface>

        <section aria-label="Pesanan">
          <SectionHeading title={`Pesanan eSIM (${customer.orders.length})`} />
          <AdminSurface className="divide-y divide-border p-3">
            {customer.orders.length === 0 ? (
              <Empty>Belum ada pesanan.</Empty>
            ) : (
              customer.orders.map((order) => (
                <article
                  key={order.id}
                  className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      to="/admin/orders"
                      search={{ q: order.code ?? "" } as never}
                      className="font-mono text-xs font-semibold text-brand-red"
                    >
                      {order.code ?? order.id}
                    </Link>
                    <p className="truncate text-muted-foreground">{order.items || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      Dibuat {formatAdminDateTime(order.createdAt)}
                      {order.paidAt ? ` · Dibayar ${formatAdminDateTime(order.paidAt)}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusPill
                      tone={
                        order.status === "READY" || order.status === "INSTALLED"
                          ? "good"
                          : "neutral"
                      }
                    >
                      {order.status}
                    </StatusPill>
                    <p className="mt-1 font-semibold">{money(order.total, order.currency)}</p>
                  </div>
                </article>
              ))
            )}
          </AdminSurface>
        </section>

        {customer.kind === "member" && (
          <>
            <section aria-label="Perjalanan">
              <SectionHeading title={`Perjalanan (${customer.trips.length})`} />
              <AdminSurface className="divide-y divide-border p-3">
                {customer.trips.length === 0 ? (
                  <Empty>Belum ada perjalanan.</Empty>
                ) : (
                  customer.trips.map((trip) => (
                    <article
                      key={`${trip.name}-${trip.createdAt}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{trip.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {trip.destination} · {trip.departure ?? "?"} → {trip.returnDate ?? "?"}
                        </p>
                      </div>
                      {trip.archived && <StatusPill>Diarsipkan</StatusPill>}
                    </article>
                  ))
                )}
              </AdminSurface>
            </section>

            <section aria-label="Titip Belanja">
              <SectionHeading title={`Titip Belanja (${customer.shopping.length})`} />
              <AdminSurface className="divide-y divide-border p-3">
                {customer.shopping.length === 0 ? (
                  <Empty>Belum ada pesanan Titip Belanja.</Empty>
                ) : (
                  customer.shopping.map((order) => (
                    <article key={order.code} className="py-2.5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">{order.code}</span>
                        <StatusPill>{order.status}</StatusPill>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                          maximumFractionDigits: 0,
                        }).format(order.totalIdr)}
                        {" · "}
                        {formatAdminDateTime(order.createdAt)}
                      </p>
                      {(order.recipientName || order.recipientWhatsapp || order.city) && (
                        <p className="text-xs text-muted-foreground">
                          Penerima:{" "}
                          {[order.recipientName, order.recipientWhatsapp, order.city]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </article>
                  ))
                )}
              </AdminSurface>
            </section>

            <section aria-label="Feeds">
              <SectionHeading
                title="Feeds"
                detail={`${customer.feeds.posts.length} post · ${customer.feeds.comments} komentar · ${customer.feeds.likes} suka`}
              />
              <AdminSurface className="divide-y divide-border p-3">
                {customer.feeds.posts.length === 0 ? (
                  <Empty>Belum ada postingan.</Empty>
                ) : (
                  customer.feeds.posts.map((post) => (
                    <article key={post.id} className="py-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill>{post.kind}</StatusPill>
                        <StatusPill tone={post.status === "PUBLISHED" ? "good" : "warn"}>
                          {post.status}
                        </StatusPill>
                        <span className="text-xs text-muted-foreground">
                          {formatAdminDateTime(post.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-muted-foreground">{post.excerpt}</p>
                    </article>
                  ))
                )}
              </AdminSurface>
            </section>

            <section aria-label="Persetujuan data">
              <SectionHeading
                title="Persetujuan data"
                detail="Pilihan terakhir pelanggan; analitik adalah pilihan perangkat."
              />
              <AdminSurface className="divide-y divide-border p-3">
                {customer.consents.length === 0 ? (
                  <Empty>Belum menjawab persetujuan data.</Empty>
                ) : (
                  customer.consents.map((consent) => (
                    <div
                      key={consent.purpose}
                      className="flex items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <span>{PURPOSE[consent.purpose] ?? consent.purpose}</span>
                      <span className="flex items-center gap-2">
                        <StatusPill tone={consent.granted ? "good" : "neutral"}>
                          {consent.granted ? "Setuju" : "Tidak"}
                        </StatusPill>
                        <span className="text-xs text-muted-foreground">
                          {formatAdminDateTime(consent.at)}
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </AdminSurface>
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
