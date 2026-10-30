// Demo order store (browser). Replace with Cloud tables + webhooks when going live.
import { useEffect, useState } from "react";
import type { EsimProfile } from "./providers";
import { createGuestOrderDraft, getGuestOrders } from "./guest-orders.fn";
import { claimGuestOrderForMember, getMemberOrders } from "./member-orders.fn";
import { rebuildMayarInvoice } from "./mayar-gateway";
import { createMayarInvoice } from "./mayar-gateway";
import { mapGuestOrderRecord } from "./guest-order-view";
import { effectivePaymentStatus } from "./payment-expiry";

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
  paymentExpiresAt?: number | null;
  esim?: EsimProfile;
  usedGb?: number;
  providerOrderNo?: string;
  priceSnapshot?: { amountIdr: number; capturedAt: number; currency: "IDR"; packageId: string };
  /** True when this order came from the verified member read path rather than a local guest token. */
  fromMemberAccount?: boolean;
};

const KEY = "djiwa.orders";
const memberOrderCache: Order[] = [];
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
export async function refreshOrdersFromServer(onMerged?: (orders: Order[]) => void): Promise<void> {
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

  // Member reads are independent of the guest list: a signed-in customer must see their orders even
  // on a device that never held a guest token. An unauthenticated caller simply gets [].
  const [guestResult, memberResult] = await Promise.allSettled([
    credentials.length ? getGuestOrders({ data: credentials }) : Promise.resolve([]),
    getMemberOrders(),
  ]);

  const guestRemote =
    guestResult.status === "fulfilled" ? guestResult.value.map(mapGuestOrderRecord) : [];
  const memberRemote: Order[] =
    memberResult.status === "fulfilled"
      ? memberResult.value.map((record) => ({
          ...mapGuestOrderRecord(record),
          fromMemberAccount: true,
        }))
      : [];

  if (guestResult.status === "rejected" && memberResult.status === "rejected") return;

  const current = read();
  const guestById = new Map(guestRemote.map((order) => [order.id, order]));
  const memberById = new Map(memberRemote.map((order) => [order.id, order]));

  // The server copy wins over the local cache, and an order owned by the account is not shown twice.
  const seen = new Set<string>();
  const merged: Order[] = [];
  for (const order of current) {
    if (seen.has(order.id)) continue;
    if (!hasGuestOrderAccess(order.id) && !memberById.has(order.id)) continue;
    seen.add(order.id);
    merged.push(memberById.get(order.id) ?? guestById.get(order.id) ?? order);
  }
  for (const order of [...memberRemote, ...guestRemote]) {
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    merged.unshift(order);
  }
  write(merged);
  onMerged?.(merged);
}

/**
 * Import the guest orders bought on this device into the signed-in account.
 *
 * The guest access token is what proves the purchase, and it is verified server-side by hash
 * comparison. Nothing is claimed by matching an email. The server refuses an order that already
 * belongs to a different account, and re-claiming is a no-op, so this is safe to call on every
 * profile visit.
 */
export async function claimGuestOrders(): Promise<{ claimed: number; already: number }> {
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
  if (!credentials.length) return { claimed: 0, already: 0 };

  let claimed = 0;
  let already = 0;
  for (const credential of credentials) {
    try {
      const result = await claimGuestOrderForMember({ data: credential });
      if (result.claimed) claimed += 1;
      else if (result.reason === "already_member") already += 1;
    } catch {
      // Already-owned, unverified, or a transient failure: none of these should stop the loop, and
      // the next profile visit retries.
    }
  }
  if (claimed > 0) await refreshOrdersFromServer();
  return { claimed, already };
}

export function useOrders() {
  const [orders, set] = useState<Order[] | null>(null);
  useEffect(() => {
    let active = true;
    const f = () =>
      set(
        read().filter((order) => order.fromMemberAccount === true || hasGuestOrderAccess(order.id)),
      );
    f();
    window.addEventListener("djiwa-orders", f);
    // Pull both ownership paths: guest orders held by this browser and every order owned by the
    // verified session, so a signed-in customer sees the same list on any device.
    void refreshOrdersFromServer(active ? (merged) => set(merged) : undefined);
    return () => {
      active = false;
      window.removeEventListener("djiwa-orders", f);
    };
  }, []);
  return orders;
}

type InvoiceInput = Parameters<typeof createMayarInvoice>[0]["data"];

function isMayarDuplicateError(error: unknown) {
  return error instanceof Error && /duplicate request|tunggu.*menit/i.test(error.message);
}

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
      if (isMayarDuplicateError(error)) {
        throw new Error("Pembayaran sedang diproses. Tunggu sekitar 1 menit sebelum mencoba lagi.");
      }
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
  return typeof token === "string" && token.length >= 32 && token.length <= 256 ? token : undefined;
}

export function saveGuestAccess(orderId: string, accessToken: string): void {
  if (!orderId || accessToken.length < 32) return;
  const access = readGuestAccess();
  access[orderId] = accessToken;
  localStorage.setItem(ACCESS_KEY, JSON.stringify(access));
}

export function hasGuestOrderAccess(orderId: string): boolean {
  return guestAccessTokenFor(orderId) !== undefined;
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
  // Once the draft is persisted, the guest access token is the recovery credential. Clear the
  // draft key now so a later purchase cannot reuse this order's idempotency key.
  sessionStorage.removeItem("djiwa.pending-order");
  let paymentUrl: string | undefined;
  let paymentReference: string | undefined;
  try {
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
    paymentUrl = invoice.paymentUrl;
    paymentReference = invoice.invoiceId;
  } catch {
    // The order and its guest access token already exist. Keep the customer on its order page,
    // where ensurePaymentLink() can safely reconcile/rebuild the Mayar invoice without creating a
    // second order. Do not turn an invoice outage into a false "order was not saved" message.
    console.warn("[checkout] order saved; payment link needs recovery");
  }
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
    paymentExpiresAt: saved.paymentExpiresAtMs,
    ...(paymentUrl ? { paymentUrl } : {}),
    ...(paymentReference ? { paymentReference } : {}),
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
  if (
    !o ||
    effectivePaymentStatus(o.status, o.paymentExpiresAt) === "EXPIRED" ||
    !["ORDER_CREATED", "WAITING_PAYMENT"].includes(o.status)
  )
    return false;
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
    effectivePaymentStatus(o.status, o.paymentExpiresAt, now) === "EXPIRED"
      ? { ...o, status: "EXPIRED" as const }
      : o.expiresAt && o.expiresAt <= now && ["READY", "INSTALLED"].includes(o.status)
        ? { ...o, status: "EXPIRED" as const }
        : o,
  );
  write(changed);
}
