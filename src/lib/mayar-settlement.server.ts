import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.server";
import { customerOrders, guestOrderAccess } from "../../drizzle/schema";
import { hashGuestAccessToken } from "./guest-order-access.server";
import { fetchMayarTransaction } from "./mayar-gateway";
import { provisionSettledTravelOrder } from "./mayar-provisioning.server";
import { readMayarSnapshot, toIsoTimestamp } from "./payment-snapshot";

const verifySchema = z.object({
  orderId: z.string().uuid(),
  accessToken: z.string().min(32).max(256),
});

const SETTLED_STATUSES = new Set([
  "PAYMENT_CONFIRMED",
  "PROVISIONING",
  "READY",
  "INSTALLED",
]);

async function startProvisioning(orderId: string) {
  try {
    return await provisionSettledTravelOrder(orderId);
  } catch (error) {
    const warning = error instanceof Error ? error.message.slice(0, 200) : "provisioning_failed";
    return { started: false, status: "PROVISIONING_FAILED", warning };
  }
}

/**
 * Settles a Travel order after the customer returns from Mayar.
 *
 * A redirect back to the app is not proof of payment, so the transaction is
 * re-verified server-side with the Mayar API before anything is fulfilled.
 * Settlement itself runs through the idempotent
 * `settle_mayar_travel_payment` function and provisioning starts only after a
 * verified PAID status, so repeated calls (webhook + returning customer) are
 * safe. Guest ownership is enforced with the stored access-token hash.
 */
export const verifyMayarPayment = createServerFn({ method: "POST" })
  .validator(verifySchema)
  .handler(async ({ data }) => {
    const accessHash = hashGuestAccessToken(data.accessToken);
    const rows = await db
      .select({ order: customerOrders })
      .from(customerOrders)
      .innerJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
      .where(
        and(
          eq(customerOrders.id, data.orderId),
          eq(guestOrderAccess.accessTokenHash, accessHash),
        ),
      )
      .limit(1);
    const order = rows[0]?.order;
    if (!order) throw new Error("Pesanan tidak ditemukan");

    const mayar = readMayarSnapshot(order.priceSnapshot);
    if (!mayar.transactionId) {
      return { status: order.status, settled: false, reason: "invoice_not_created" as const };
    }
    if (SETTLED_STATUSES.has(order.status)) {
      return { status: order.status, settled: true, provisioning: await startProvisioning(order.id) };
    }

    const transaction = await fetchMayarTransaction(mayar.transactionId);
    if (String(transaction.status ?? "").toLowerCase() !== "paid") {
      return { status: order.status, settled: false, reason: "payment_pending" as const };
    }

    const amountIdr = Number(transaction.amount ?? order.totalAmount);
    if (!Number.isSafeInteger(amountIdr) || amountIdr <= 0) {
      return { status: order.status, settled: false, reason: "amount_unavailable" as const };
    }
    const paidAt = toIsoTimestamp(transaction.updatedAt ?? transaction.createdAt);
    const eventId = `mayar:${mayar.transactionId}`;
    const payload = {
      eventId,
      app: "djiwa-travel",
      orderId: order.id,
      invoiceId: mayar.invoiceId ?? "",
      transactionId: mayar.transactionId,
      amountIdr,
      currency: "IDR",
      status: "PAID",
      paidAt,
      source: "customer-return-verification",
    };
    await db.execute(
      sql`select public.settle_mayar_travel_payment(${eventId}, ${order.id}::uuid, ${mayar.invoiceId ?? ""}, ${mayar.transactionId}, ${amountIdr}, ${paidAt}::timestamptz, ${JSON.stringify(payload)}::jsonb) as result`,
    );
    return { status: "PAID", settled: true, provisioning: await startProvisioning(order.id) };
  });
