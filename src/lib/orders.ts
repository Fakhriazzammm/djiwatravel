// Demo order store (browser). Replace with Cloud tables + webhooks when going live.
import { useEffect, useState } from "react";
import { mockEsimProvider, type EsimProfile } from "./providers";

export type OrderStatus = "ORDER_CREATED" | "WAITING_PAYMENT" | "PAID" | "PROVISIONING" | "READY" | "INSTALLED" | "EXPIRED" | "PROVISIONING_FAILED" | "CANCELLED" | "REFUNDED";
export type Order = {
  id: string; packageId: string; amount: number; email: string; whatsapp: string;
  method: "qris" | "va"; status: OrderStatus; createdAt: number; expiresAt?: number; esim?: EsimProfile; usedGb?: number; providerOrderNo?: string; priceSnapshot?: { amountIdr: number; capturedAt: number; currency: "IDR"; packageId: string };
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
  const now = Date.now();
  const order: Order = { ...o, id: "DJ" + now.toString(36).toUpperCase(), status: "ORDER_CREATED", createdAt: now, priceSnapshot: { amountIdr: o.amount, capturedAt: now, currency: "IDR", packageId: o.packageId } };
  write([order, ...read()]);
  return order;
}

const patch = (id: string, p: Partial<Order>) => write(read().map((o) => (o.id === id ? { ...o, ...p } : o)));

// Simulates the verified payment webhook. Idempotent: only acts from WAITING_PAYMENT / failed.
export async function simulatePaid(id: string) {
  const o = read().find((x) => x.id === id);
  if (!o || (o.status !== "ORDER_CREATED" && o.status !== "WAITING_PAYMENT" && o.status !== "PROVISIONING_FAILED")) return;
  if (o.esim) return patch(id, { status: "READY" });
  patch(id, { status: "PAID" });
  patch(id, { status: "PROVISIONING" });
  try {
    const esim = await mockEsimProvider.createEsim(o.packageId, o.id);
    patch(id, { status: "READY", esim, usedGb: 0, expiresAt: Date.now() + 30 * 864e5 });
  } catch {
    patch(id, { status: "PROVISIONING_FAILED" });
  }
}

export function cancelOrder(id: string) {
  const o = read().find((x) => x.id === id);
  if (!o || !["ORDER_CREATED", "WAITING_PAYMENT"].includes(o.status)) return false;
  patch(id, { status: "CANCELLED" });
  return true;
}

export function retryProvisioning(id: string) {
  const o = read().find((x) => x.id === id);
  if (!o || o.status !== "PROVISIONING_FAILED") return false;
  void simulatePaid(id);
  return true;
}

export function markInstalled(id: string) {
  const o = read().find((x) => x.id === id);
  if (!o || o.status !== "READY") return false;
  patch(id, { status: "INSTALLED" });
  return true;
}

export function refreshExpiredOrders(now = Date.now()) {
  const changed = read().map((o) => (o.expiresAt && o.expiresAt <= now && ["READY", "INSTALLED"].includes(o.status) ? { ...o, status: "EXPIRED" as const } : o));
  write(changed);
}
