// Demo order store (browser). Replace with Cloud tables + webhooks when going live.
import { useEffect, useState } from "react";
import { mockEsimProvider, type EsimProfile } from "./providers";

export type OrderStatus = "WAITING_PAYMENT" | "PAID" | "PROVISIONING" | "READY" | "PROVISIONING_FAILED" | "REFUNDED";
export type Order = {
  id: string; packageId: string; amount: number; email: string; whatsapp: string;
  method: "qris" | "va"; status: OrderStatus; createdAt: number; esim?: EsimProfile; usedGb?: number;
};

const KEY = "djiwa.orders";
const read = (): Order[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const write = (o: Order[]) => { localStorage.setItem(KEY, JSON.stringify(o)); window.dispatchEvent(new Event("djiwa-orders")); };

export function useOrders() {
  const [orders, set] = useState<Order[] | null>(null);
  useEffect(() => {
    const f = () => set(read());
    f(); window.addEventListener("djiwa-orders", f);
    return () => window.removeEventListener("djiwa-orders", f);
  }, []);
  return orders;
}

export function createOrder(o: Omit<Order, "id" | "status" | "createdAt">) {
  const order: Order = { ...o, id: "DJ" + Date.now().toString(36).toUpperCase(), status: "WAITING_PAYMENT", createdAt: Date.now() };
  write([order, ...read()]);
  return order;
}

const patch = (id: string, p: Partial<Order>) => write(read().map((o) => (o.id === id ? { ...o, ...p } : o)));

// Simulates the verified payment webhook. Idempotent: only acts from WAITING_PAYMENT / failed.
export async function simulatePaid(id: string) {
  const o = read().find((x) => x.id === id);
  if (!o || (o.status !== "WAITING_PAYMENT" && o.status !== "PROVISIONING_FAILED")) return;
  if (o.esim) return patch(id, { status: "READY" });
  patch(id, { status: "PROVISIONING" });
  try {
    const esim = await mockEsimProvider.createEsim(o.packageId, o.id);
    patch(id, { status: "READY", esim, usedGb: 0 });
  } catch {
    patch(id, { status: "PROVISIONING_FAILED" });
  }
}
