import { EsimStatusBadge } from "@/components/esim-status-badge";
import { OrderLoading } from "@/components/order-loading";
import { RowChevron } from "@/components/profile/profile-service-grid";
import { BackBar, Page, btnPrimary } from "@/components/shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { destinationArt } from "@/lib/destination-art";
import { effectiveOrderStatus } from "@/lib/esim-status";
import { useOrders } from "@/lib/orders";
import { rupiah } from "@/lib/pricing";

export const Route = createFileRoute("/my-orders")({
  head: () => ({
    meta: [
      { title: "Pesanan saya — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MyOrders,
});

const FINISHED = ["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"];

/** Every order this customer owns (signed-in account plus guest orders held by this browser). */
function MyOrders() {
  const orders = useOrders();
  const sorted = orders ? [...orders].sort((a, b) => b.createdAt - a.createdAt) : null;
  const groupClass = "overflow-hidden rounded-[20px] bg-surface";
  const rowClass =
    "tap relative flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left text-[16px]";

  return (
    <Page tabs={false}>
      <BackBar title="Pesanan saya" fallbackTo="/profile" />
      {sorted === null ? (
        <div className="mt-4">
          <OrderLoading list label="Memuat pesanan…" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="font-semibold">Belum ada pesanan</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Pesanan eSIM kamu akan muncul di sini.
          </p>
          <Link to="/explore" className={`${btnPrimary} mt-4`}>
            Cari Destinasi
          </Link>
        </div>
      ) : (
        <>
          <p className="px-1 pb-2 pt-3 text-[13px] text-muted-foreground">
            {sorted.length} pesanan
          </p>
          <section className={groupClass} aria-label="Daftar pesanan">
            {sorted.map((o, index) => {
              const status = effectiveOrderStatus(o.status, o.expiresAt);
              const finished = FINISHED.includes(status);
              const art = destinationArt(o.locationCodes?.[0]);
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
                  className={`${rowClass} ${index > 0 ? "border-t border-border/60" : ""}`}
                >
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-2xl ${art.tint} ${finished ? "opacity-60 grayscale" : ""}`}
                  >
                    {art.src ? (
                      <img
                        src={art.src}
                        alt=""
                        width={36}
                        height={36}
                        loading="lazy"
                        decoding="async"
                        className="size-9 object-contain"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold leading-tight">
                      {o.packageName ?? o.packageId}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                      {rupiah(o.amount)} · {date} · #{code}
                    </span>
                    <span className="mt-1.5 block">
                      <EsimStatusBadge status={status} />
                    </span>
                  </span>
                  <RowChevron />
                </Link>
              );
            })}
          </section>
        </>
      )}
    </Page>
  );
}
