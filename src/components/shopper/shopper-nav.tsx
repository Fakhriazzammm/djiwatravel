import { Link } from "@tanstack/react-router";
import { ReceiptText, ShoppingBag, ShoppingCart } from "lucide-react";
import { FixedLayer } from "@/components/motion-primitives";
import { cartCount, useShopperCart } from "./shopper-cart";

/** Matches TripTabBar's compact iOS navigation, scoped to Titip Belanja. */
export function ShopperNav({
  active,
  onCart,
}: {
  active: "shop" | "cart" | "orders";
  onCart?: () => void;
}) {
  const count = cartCount(useShopperCart());
  const tabs = [
    { id: "shop", label: "Belanja", icon: ShoppingBag },
    { id: "cart", label: "Keranjang", icon: ShoppingCart },
    { id: "orders", label: "Pesanan", icon: ReceiptText },
  ] as const;
  return (
    <FixedLayer>
      <nav
        aria-label="Menu Titip Belanja"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 px-1 pt-1.5 pb-1">
          {tabs.map(({ id, label, icon: Icon }) => {
            const on = active === id;
            const className = `tap flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium ${
              on ? "text-brand-red" : "text-muted-foreground"
            }`;
            const body = (
              <>
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={on ? 2.3 : 1.8} aria-hidden="true" />
                  {id === "cart" && count > 0 && (
                    <span className="absolute -right-3 -top-1 flex min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] font-bold text-white">
                      {count}
                    </span>
                  )}
                </span>
                {label}
              </>
            );
            if (id === "cart" && onCart)
              return (
                <button
                  key={id}
                  type="button"
                  className={className}
                  onClick={onCart}
                  aria-current={on ? "page" : undefined}
                >
                  {body}
                </button>
              );
            return id === "orders" ? (
              <Link
                key={id}
                to="/titip-belanja/pesanan"
                className={className}
                aria-current={on ? "page" : undefined}
              >
                {body}
              </Link>
            ) : (
              <Link
                key={id}
                to="/titip-belanja"
                search={id === "cart" ? { cart: true } : {}}
                className={className}
                aria-current={on ? "page" : undefined}
              >
                {body}
              </Link>
            );
          })}
        </div>
      </nav>
    </FixedLayer>
  );
}
