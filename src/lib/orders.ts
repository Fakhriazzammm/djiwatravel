// Demo order store (browser). Replace with Cloud tables + webhooks when going live.
import { useEffect, useState } from "react";
import type { EsimProfile } from "./providers";
import { createGuestOrderDraft, getGuestOrders } from "./guest-orders.server";
import { rebuildMayarInvoice } from "./mayar-gateway";
import { createMayarInvoice } from "./mayar-gateway";
import { mapGuestOrderRecord } from "./guest-order-view";

export type OrderStatus =
  | "ORDER_CREATED"
  | "WAITING_PAYMENT"
  | "PAID"
  | "PROVISIONING"
  | "READY"
  | "INSTALLED"
  | "EXPIRED"
  | "PROVISIONING_FAILED"
  | "CANCELLED"
  | "REFUNDED";
export type Order = {
  id: string;
  publicOrderCode?: string;
  packageId: string;
  packageName?: string;
  locationCodes?: string[];
  durationDays?: number;
  volumeBytes?: number | null;
  supportsTopUp?: boolean;
  paymentUrl?: string;
  paymentReference?: string;
  amount: number;
  email?: string;
  whatsapp?: string;
  method: "qris" | "va";
  status: OrderStatus;
  createdAt: number;
  expiresAt?: number;
  esim?: EsimProfile;
  usedGb?: number;
  providerOrderNo?: string;
  priceSnapshot?: { amountIdr: number; capturedAt: number; currency: "IDR"; packageId: string };
};

const KEY = "djiwa.orders";
const read = (): Order[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};
const write = (o: Order[]) => {
  localStorage.setItem(KEY, JSON.stringify(o));
  window.dispatchEvent(new Event("djiwa-orders"));
};

/** Pulls the authoritative server state for every stored guest credential. */
export async function refreshOrdersFromServer(): Promise<void> {
  const credentials = Object.entries(readGuestAccess())
    .filter(
      ([orderId, token]) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          orderId,
        ) &&
        typeof token === "string" &&
        token.length >= 32 &&
        token.length <= 256,
    )
    .slice(0, 20)
    .map(([orderId, accessToken]) => ({ orderId, accessToken }));
  if (!credentials.length) return;
  try {
    const records = await getGuestOrders({ data: credentials });
    const remote = records.map(mapGuestOrderRecord);
    const current = read();
    const byId = new Map(remote.map((order) => [order.id, order]));
    const merged = current.map((order) => byId.get(order.id) ?? order);
    for (const order of remote) {
      if (!current.some((existing) => existing.id === order.id)) merged.unshift(order);
    }
    write(merged);
  } catch {
    // Keep the local order cache available while the server is unreachable.
  }
}

export function useOrders() {
  const [orders, set] = useState<Order[] | null>(null);
  useEffect(() => {
    const f = () => set(read());
    f();
    window.addEventListener("djiwa-orders", f);
    void refreshOrdersFromServer();
    return () => window.removeEventListener("djiwa-orders", f);
  }, []);
  return orders;
}

type InvoiceInput = Parameters<typeof createMayarInvoice>[0]["data"];

/**
 * Invoice creation talks to an external provider over the public internet, so a single slow or
 * dropped request used to leave the customer with an order and no way to pay. Retries are safe:
 * the server returns the existing invoice when one is already attached to the order.
 */
export async function createInvoiceWithRetry(
  input: InvoiceInput,
  attempts = 3,
): Promise<Awaited<ReturnType<typeof createMayarInvoice>>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await createMayarInvoice({ data: input });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_200));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Tagihan pembayaran gagal dibuat");
}

/**
 * Rebuilds the payment link for an order that has none: the server reads the saved contact from
 * guest_order_access and creates the Mayar invoice again, so the customer only needs the order
 * open (the access token already lives in this browser).
 */
export async function ensurePaymentLink(order: Order): Promise<string | null> {

  const accessToken = guestAccessTokenFor(order.id);
  if (!accessToken) return null;
  const invoice = await rebuildMayarInvoice({ data: { orderId: order.id, accessToken } });
  patch(order.id, {
    paymentUrl: invoice.paymentUrl,
    paymentReference: invoice.invoiceId,
    status: "WAITING_PAYMENT",
  });
  return invoice.paymentUrl;
}

const ACCESS_KEY = "djiwa.guest-order-access";
type PendingOrder = {
  packageId: string;
  email: string;
  whatsapp: string;
  method: "qris" | "va";
  accessToken: string;
  idempotencyKey: string;
  createdAt: number;
};
function readGuestAccess(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ACCESS_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Access token for one guest order, used to re-verify its payment server-side. */
export function guestAccessTokenFor(orderId: string): string | undefined {
  const token = readGuestAccess()[orderId];
  return typeof token === "string" && token.length >= 32 && token.length <= 256
    ? token
    : undefined;
}

export async function createOrder(
  o: Omit<Order, "id" | "status" | "createdAt" | "email" | "whatsapp"> & {
    email: string;
    whatsapp: string;
  },
): Promise<Order> {
  let pending: PendingOrder | undefined;
  try {
    pending = JSON.parse(sessionStorage.getItem("djiwa.pending-order") || "null") ?? undefined;
  } catch {
    pending = undefined;
  }
  const matchingPending =
    pending &&
    Date.now() - pending.createdAt < 30 * 60 * 1000 &&
    pending.packageId === o.packageId &&
    pending.email === o.email &&
    pending.whatsapp === o.whatsapp &&
    pending.method === o.method
      ? pending
      : undefined;
  const accessToken =
    matchingPending?.accessToken ??
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  const idempotencyKey = matchingPending?.idempotencyKey ?? crypto.randomUUID();
  const nextPending: PendingOrder = {
    packageId: o.packageId,
    email: o.email,
    whatsapp: o.whatsapp,
    method: o.method,
    accessToken,
    idempotencyKey,
    createdAt: Date.now(),
  };
  sessionStorage.setItem("djiwa.pending-order", JSON.stringify(nextPending));
  const saved = await createGuestOrderDraft({
    data: {
      packageCode: o.packageId,
      email: o.email,
      whatsapp: o.whatsapp,
      paymentMethod: o.method,
      idempotencyKey,
      accessToken,
    },
  });
  const access = readGuestAccess();
  access[saved.id] = accessToken;
  localStorage.setItem(ACCESS_KEY, JSON.stringify(access));
  const invoice = await createInvoiceWithRetry({
    orderId: saved.id,
    accessToken,
    amountIdr: saved.amount,
    customerName: o.email.split("@")[0] || "Customer",
    customerEmail: o.email,
    customerMobile: o.whatsapp,
    description: `Djiwa Travel ${saved.publicOrderCode}`,
    redirectUrl: `${window.location.origin}/receipt/${saved.id}`,
  });
  sessionStorage.removeItem("djiwa.pending-order");
  const order: Order = {
    id: saved.id,
    publicOrderCode: saved.publicOrderCode,
    packageId: saved.packageCode,
    amount: saved.amount,
    // Kept locally so the payment link can be rebuilt later without asking the customer again.
    email: o.email,
    whatsapp: o.whatsapp,
    method: o.method,
    status: "WAITING_PAYMENT",
    paymentUrl: invoice.paymentUrl,
    paymentReference: invoice.invoiceId,
    createdAt: saved.createdAtMs,
    priceSnapshot: {
      amountIdr: saved.amount,
      capturedAt: saved.createdAtMs,
      currency: "IDR",
      packageId: saved.packageCode,
    },
  };
  write([order, ...read()]);
  return order;
}

const patch = (id: string, p: Partial<Order>) =>
  write(read().map((o) => (o.id === id ? { ...o, ...p } : o)));

export function cancelOrder(id: string) {
  const o = read().find((x) => x.id === id);
  if (!o || !["ORDER_CREATED", "WAITING_PAYMENT"].includes(o.status)) return false;
  patch(id, { status: "CANCELLED" });
  return true;
}

export function markInstalled(id: string) {
  const o = read().find((x) => x.id === id);
  if (!o || o.status !== "READY") return false;
  patch(id, { status: "INSTALLED" });
  return true;
}

export function refreshExpiredOrders(now = Date.now()) {
  const changed = read().map((o) =>
    o.expiresAt && o.expiresAt <= now && ["READY", "INSTALLED"].includes(o.status)
      ? { ...o, status: "EXPIRED" as const }
      : o,
  );
  write(changed);
}
