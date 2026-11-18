import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, PackageOpen } from "lucide-react";
import { CustomerAuth } from "@/components/customer-auth";
import { BackBar, Page } from "@/components/shell";
import { ShippingStatusBadge, shippingPrimaryBtn } from "@/components/shipping/shipping-ui";
import { listMyShippingOrders } from "@/lib/shipping.fn";
import { formatIdr } from "@/lib/shipping";

export const Route = createFileRoute("/kirim-barang/pengiriman")({
  head: () => ({
    meta: [
      { title: "Pengiriman Saya — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  // A signed-out visitor gets the sign-in card instead of an error screen.
  loader: () => listMyShippingOrders().catch(() => null),
  component: MyShipments,
});

function MyShipments() {
  const orders = Route.useLoaderData();
  return (
    <Page tabs={false}>
      <BackBar title="Pengiriman Saya" fallbackTo="/kirim-barang" />
      {orders === null ? (
        <div className="mt-4">
          <p className="mb-2 text-[13px] text-muted-foreground">
            Masuk untuk melihat pengirimanmu.
          </p>
          <CustomerAuth size="block" />
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-10 text-center">
          <PackageOpen className="mx-auto size-9 text-brand-red" aria-hidden="true" />
          <p className="mt-2 text-[14px] font-semibold">Belum ada pengiriman</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Paket yang kamu kirim ke Jepang muncul di sini.
          </p>
          <Link to="/kirim-barang" className={`${shippingPrimaryBtn} mt-3`}>
            Mulai kirim barang
          </Link>
        </div>
      ) : (
        <ul className="ios-group divide-y divide-border/70">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to="/kirim-barang/$id" params={{ id: o.id }} className="tap ios-row">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{o.code}</span>
                  <span className="line-clamp-1 block text-[11px] text-muted-foreground">
                    {o.recipientName}, {o.city} · {o.contents}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <ShippingStatusBadge status={o.status} />
                  {o.totalIdr !== null && (
                    <span className="text-[12px] font-bold">{formatIdr(o.totalIdr)}</span>
                  )}
                </span>
                <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
