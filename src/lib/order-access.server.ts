import { and, eq, gt } from "drizzle-orm";
import {
  customerOrderPaymentDetails,
  customerOrders,
  guestOrderAccess,
} from "../../drizzle/schema";
import { db } from "../db/client.server";
import { getAuthenticatedUser } from "./customer-session.fn";
import { hashGuestAccessToken } from "./guest-order-access.server";

export type ResolvedOrderAccess = {
  order: typeof customerOrders.$inferSelect;
  paymentMethod: string;
  email: string;
  whatsapp: string;
};

/**
 * Decide whether the caller may act on an order (pay, verify, rebuild an invoice).
 *
 * - Account orders: the verified Better Auth session must own the order. The browser never
 *   supplies the owner, and a session id from another account resolves to "not found".
 * - Legacy guest orders: a matching, unexpired guest access token is still accepted so orders
 *   created before the account requirement keep working during the transition.
 *
 * Contacts and payment method come from the server-side tables, never from the request body.
 * Any miss fails closed with the same "not found" message so ids cannot be probed.
 */
export async function resolveOrderAccess(input: {
  orderId: string;
  accessToken?: string | undefined;
}): Promise<ResolvedOrderAccess> {
  if (input.accessToken) {
    const rows = await db
      .select({ order: customerOrders, access: guestOrderAccess })
      .from(customerOrders)
      .innerJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
      .where(
        and(
          eq(customerOrders.id, input.orderId),
          eq(guestOrderAccess.accessTokenHash, hashGuestAccessToken(input.accessToken)),
          gt(guestOrderAccess.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("Pesanan tidak ditemukan");
    return {
      order: row.order,
      paymentMethod: row.access.paymentMethod,
      email: row.access.email,
      whatsapp: row.access.whatsapp,
    };
  }

  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) throw new Error("Masuk untuk melanjutkan pembayaran pesanan ini");
  const rows = await db
    .select({ order: customerOrders, details: customerOrderPaymentDetails })
    .from(customerOrders)
    .innerJoin(
      customerOrderPaymentDetails,
      eq(customerOrderPaymentDetails.orderId, customerOrders.id),
    )
    .where(
      and(eq(customerOrders.id, input.orderId), eq(customerOrders.customerAuthSubject, user.id)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Pesanan tidak ditemukan");
  return {
    order: row.order,
    paymentMethod: row.details.paymentMethod,
    email: row.details.email,
    whatsapp: row.details.whatsapp,
  };
}
