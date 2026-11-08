import { useSyncExternalStore } from "react";
import { quoteShopperOrder, type ShopperConfig, type ShopperProduct } from "@/lib/personal-shopper";

/** What the cart remembers about a product so it still renders if the catalog changes. */
export type CartLine = {
  key: string;
  productId: string;
  size: string;
  color: string | null;
  quantity: number;
  name: string;
  brand: ShopperProduct["brand"];
  image: string | null;
  unitMinor: number;
};

const STORAGE_KEY = "djiwa.shopper.cart.v1";
const listeners = new Set<() => void>();
let lines: CartLine[] = [];
let loaded = false;
const EMPTY: CartLine[] = [];

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (Array.isArray(raw))
      lines = raw.filter(
        (l): l is CartLine =>
          Boolean(l) &&
          typeof (l as CartLine).key === "string" &&
          typeof (l as CartLine).productId === "string" &&
          Number.isInteger((l as CartLine).quantity),
      );
  } catch {
    lines = [];
  }
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode: the cart still works for this visit.
  }
  listeners.forEach((l) => l());
}

export const lineKey = (productId: string, size: string, color: string | null) =>
  `${productId}|${size}|${color ?? ""}`;

export const cartActions = {
  add(line: Omit<CartLine, "key">, max: number) {
    load();
    const key = lineKey(line.productId, line.size, line.color);
    const existing = lines.find((l) => l.key === key);
    if (existing)
      commit(
        lines.map((l) =>
          l.key === key ? { ...l, quantity: Math.min(max, l.quantity + line.quantity) } : l,
        ),
      );
    else commit([...lines, { ...line, key, quantity: Math.min(max, line.quantity) }]);
  },
  change(key: string, delta: number, max: number) {
    load();
    commit(
      lines
        .map((l) => (l.key === key ? { ...l, quantity: Math.min(max, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    );
  },
  clear() {
    load();
    commit([]);
  },
};

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      loaded = false;
      load();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function readShopperCart(): readonly CartLine[] {
  load();
  return lines;
}

export function useShopperCart(): CartLine[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return lines;
    },
    () => EMPTY,
  );
}

export function cartCount(cart: readonly CartLine[]) {
  return cart.reduce((n, l) => n + l.quantity, 0);
}

export function cartQuote(
  cart: readonly CartLine[],
  rate: number,
  config: Pick<ShopperConfig, "feePercent" | "shippingIdr">,
) {
  return quoteShopperOrder(
    cart.map((l) => ({ unitMinor: l.unitMinor, quantity: l.quantity })),
    rate,
    config,
  );
}
