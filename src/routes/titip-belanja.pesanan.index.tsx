import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { CustomerAuth } from "@/components/customer-auth";
import { BackBar, Page, btnPrimary } from "@/components/shell";
import { ProductImage } from "@/components/shopper/shopper-ui";
import { listMyShoppingOrders } from "@/lib/personal-shopper.fn";
import { ORDER_STATUS_LABEL, formatIdr, type ShopperOrderStatus } from "@/lib/personal-shopper";

export const Route = createFileRoute("/titip-belanja/pesanan/")({
  head: () => ({
    meta: [
      { title: "Pesanan Titip Belanja — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  // A signed-out visitor gets the sign-in card instead of an error screen.
  loader: () => listMyShoppingOrders().catch(() => null),
  component: ShopperOrders,
});

const TONE: Record<ShopperOrderStatus, string> = {
  PAYMENT_PENDING: "bg-[#FF9F0A]",
  PAID: "bg-[#0A84FF]",
  PURCHASED: "bg-[#0A84FF]",
  SHIPPED: "bg-[#0A84FF]",
  ARRIVED: "bg-[#34C759]",
  DELIVERED: "bg-[#34C759]",
  CANCELLED: "bg-[#8E8E93]",
  EXPIRED: "bg-[#8E8E93]",
};

function ShopperOrders() {
  const orders = Route.useLoaderData();
  return (
    <Page tabs={false}>
      <BackBar title="Pesanan Titip Belanja" fallbackTo="/titip-belanja" />
      {orders === null ? (
        <div className="mt-4">
          <p className="mb-2 text-[13px] text-muted-foreground">Masuk untuk melihat pesananmu.</p>
          <CustomerAuth size="block" />
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-10 text-center">
          <ShoppingBag className="mx-auto size-9 text-brand-red" aria-hidden="true" />
          <p className="mt-2 text-[14px] font-semibold">Belum ada pesanan</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Pesanan titip belanja kamu muncul di sini.
          </p>
          <Link to="/titip-belanja" className={`${btnPrimary} mt-3`}>
            Mulai titip belanja
          </Link>
        </div>
      ) : (
        <ul className="ios-group divide-y divide-border/70">
          {orders.map((o) => {
            const first = (o.items[0] ?? null) as { image_url: string | null; name: string } | null;
            return (
              <li key={o.id}>
                <Link to="/titip-belanja/pesanan/$id" params={{ id: o.id }} className="tap ios-row">
                  <ProductImage
                    src={first?.image_url ?? null}
                    alt={first?.name ?? "Barang"}
                    className="size-11 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{o.code}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <i className={`size-1.5 rounded-full ${TONE[o.status]}`} aria-hidden="true" />
                      {ORDER_STATUS_LABEL[o.status]} · {o.items.length} barang
                    </span>
                  </span>
                  <span className="text-[13px] font-bold">{formatIdr(o.totalIdr)}</span>
                  <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
