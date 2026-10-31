import { sql } from "drizzle-orm";
import { db } from "../db/client.server";
import { isCustomerProfileComplete } from "./customer-profile";
import { readCustomerProfile, requireBetterAuthUser } from "./customer-profile.server";
import { assertPaymentNotExpired } from "./payment-expiry";
import {
  buildTravelWalletChargeRequest,
  djiwaTravelWalletIdempotencyKey,
  parseDjiwaPayChargeResponse,
  type DjiwaPayChargeOutcome,
} from "./djiwa-pay-payment-contract";
import { djiwaPayOrderOwnedBy, walletPaymentInputSchema } from "./travel-payment-method";

const DJIWA_PAY_TRAVEL_WALLET_ENDPOINT =
  "https://api.djiwatentram.web.id/api/customer/travel-wallet-payment";

type WalletOrderRow = {
  status: string;
  total_amount: string | number;
  payment_expires_at: string | null;
  paymentMethod: string | null;
  customerAuthSubject: string | null;
  payment_provider: string | null;
  payment_reference: string | null;
};

type WalletIntentRow = {
  status: string;
  amount: string | number;
  currency_code: string;
  idempotency_key: string;
  provider_transaction_id: string | null;
};

type WalletPaymentResult =
  | { status: "paid"; transactionId: string }
  | { status: "insufficient_balance" }
  | { status: "wallet_blocked" }
  | { status: "pending" };

async function requestCookie() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return getRequestHeader("cookie") ?? "";
}

async function claimWalletOrder(orderId: string, authSubject: string) {
  return db.transaction(async (tx) => {
    const orderResult = await tx.execute(sql`
      SELECT o.status, o.total_amount, o.payment_expires_at, o.payment_provider, o.payment_reference,
             o.customer_auth_subject AS "customerAuthSubject",
             access.payment_method AS "paymentMethod"
        FROM public.customer_orders AS o
        JOIN public.guest_order_access AS access ON access.order_id = o.id
       WHERE o.id = ${orderId}::uuid
       FOR UPDATE OF o
    `);
    const order = orderResult.rows[0] as WalletOrderRow | undefined;
    if (!order || !djiwaPayOrderOwnedBy(order, authSubject)) {
      throw new Error("Pesanan Djiwa Pay tidak ditemukan atau bukan milik akun ini");
    }
    if (order.status === "PAYMENT_CONFIRMED" && order.payment_provider === "djiwa_pay" && order.payment_reference) {
      return { status: "paid" as const, transactionId: order.payment_reference };
    }
    if (order.payment_provider && order.payment_provider !== "djiwa_pay") {
      throw new Error("Pesanan sudah menggunakan metode pembayaran lain");
    }
    if (!["ORDER_CREATED", "PAYMENT_PENDING"].includes(order.status)) {
      throw new Error("Pesanan tidak dapat dibayar lagi");
    }
    assertPaymentNotExpired(order.status, order.payment_expires_at);

    const amount = Number(order.total_amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Nominal pesanan tidak valid");
    const idempotencyKey = djiwaTravelWalletIdempotencyKey(orderId);

    await tx.execute(sql`
      INSERT INTO public.payment_intents (
        order_id, provider, idempotency_key, status, amount, currency_code, attempt_count, updated_at
      ) VALUES (
        ${orderId}::uuid, 'djiwa_pay', ${idempotencyKey}, 'CLAIMED', ${amount}, 'IDR', 0, now()
      )
      ON CONFLICT (order_id, provider) DO NOTHING
    `);
    const intentResult = await tx.execute(sql`
      SELECT status, amount, currency_code, idempotency_key, provider_transaction_id
        FROM public.payment_intents
       WHERE order_id = ${orderId}::uuid AND provider = 'djiwa_pay'
       FOR UPDATE
    `);
    const intent = intentResult.rows[0] as WalletIntentRow | undefined;
    if (
      !intent ||
      Number(intent.amount) !== amount ||
      intent.currency_code !== "IDR" ||
      intent.idempotency_key !== idempotencyKey
    ) {
      throw new Error("Payment intent Djiwa Pay tidak sesuai dengan pesanan");
    }

    if (intent.status === "PROVIDER_CONFIRMED" && intent.provider_transaction_id) {
      await tx.execute(sql`
        UPDATE public.customer_orders
           SET status = 'PAYMENT_CONFIRMED', payment_provider = 'djiwa_pay',
               payment_reference = ${intent.provider_transaction_id},
               paid_at = COALESCE(paid_at, now()), updated_at = now()
         WHERE id = ${orderId}::uuid AND customer_auth_subject = ${authSubject}
      `);
      return { status: "paid" as const, transactionId: intent.provider_transaction_id };
    }

    await tx.execute(sql`
      UPDATE public.payment_intents
         SET status = 'REQUESTING', attempt_count = attempt_count + 1,
             last_error = NULL, next_reconcile_at = NULL, updated_at = now()
       WHERE order_id = ${orderId}::uuid AND provider = 'djiwa_pay'
    `);
    return { status: "request" as const, amount, idempotencyKey };
  });
}

async function recordConfirmedWalletPayment(orderId: string, authSubject: string, transactionId: string) {
  await db.transaction(async (tx) => {
    const orderResult = await tx.execute(sql`
      SELECT o.status, o.total_amount, o.payment_provider, o.payment_reference,
             o.customer_auth_subject AS "customerAuthSubject",
             access.payment_method AS "paymentMethod"
        FROM public.customer_orders AS o
        JOIN public.guest_order_access AS access ON access.order_id = o.id
       WHERE o.id = ${orderId}::uuid
       FOR UPDATE OF o
    `);
    const order = orderResult.rows[0] as WalletOrderRow | undefined;
    if (!order || !djiwaPayOrderOwnedBy(order, authSubject)) {
      throw new Error("Djiwa Pay order ownership changed");
    }
    if (order.status === "PAYMENT_CONFIRMED" && order.payment_provider === "djiwa_pay") {
      if (order.payment_reference !== transactionId) throw new Error("Djiwa Pay transaction reference mismatch");
      return;
    }
    if (!["ORDER_CREATED", "PAYMENT_PENDING"].includes(order.status) || order.payment_provider) {
      throw new Error("Djiwa Pay order can no longer be settled");
    }

    const intentResult = await tx.execute(sql`
      SELECT status, amount, currency_code, idempotency_key, provider_transaction_id
        FROM public.payment_intents
       WHERE order_id = ${orderId}::uuid AND provider = 'djiwa_pay'
       FOR UPDATE
    `);
    const intent = intentResult.rows[0] as WalletIntentRow | undefined;
    if (!intent || Number(intent.amount) !== Number(order.total_amount) || intent.currency_code !== "IDR") {
      throw new Error("Djiwa Pay intent amount mismatch");
    }

    await tx.execute(sql`
      UPDATE public.payment_intents
         SET status = 'PROVIDER_CONFIRMED', provider_transaction_id = ${transactionId},
             last_error = NULL, next_reconcile_at = NULL, updated_at = now()
       WHERE order_id = ${orderId}::uuid AND provider = 'djiwa_pay'
    `);
    const updated = await tx.execute(sql`
      UPDATE public.customer_orders
         SET status = 'PAYMENT_CONFIRMED', payment_provider = 'djiwa_pay',
             payment_reference = ${transactionId}, paid_at = now(), updated_at = now()
       WHERE id = ${orderId}::uuid AND customer_auth_subject = ${authSubject}
         AND status IN ('ORDER_CREATED', 'PAYMENT_PENDING')
       RETURNING id
    `);
    if (updated.rows.length !== 1) throw new Error("Djiwa Pay order settlement was not recorded");
  });
}

async function recordWalletOutcome(orderId: string, authSubject: string, outcome: DjiwaPayChargeOutcome) {
  if (outcome.kind === "paid") return;
  if (outcome.kind === "pending") {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE public.payment_intents
           SET status = 'UNKNOWN', last_error = 'provider_result_unknown',
               next_reconcile_at = now() + interval '1 minute', updated_at = now()
         WHERE order_id = ${orderId}::uuid AND provider = 'djiwa_pay'
           AND provider_transaction_id IS NULL AND status <> 'PROVIDER_CONFIRMED'
      `);
      await tx.execute(sql`
        UPDATE public.customer_orders
           SET status = 'PAYMENT_PENDING', updated_at = now()
         WHERE id = ${orderId}::uuid AND customer_auth_subject = ${authSubject}
           AND status IN ('ORDER_CREATED', 'PAYMENT_PENDING')
           AND payment_provider IS NULL
      `);
    });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE public.payment_intents
         SET status = 'FAILED', last_error = ${outcome.kind}, next_reconcile_at = NULL, updated_at = now()
       WHERE order_id = ${orderId}::uuid AND provider = 'djiwa_pay'
           AND provider_transaction_id IS NULL AND status <> 'PROVIDER_CONFIRMED'
    `);
    await tx.execute(sql`
      UPDATE public.customer_orders
         SET status = 'ORDER_CREATED', updated_at = now()
         WHERE id = ${orderId}::uuid AND customer_auth_subject = ${authSubject}
           AND status IN ('ORDER_CREATED', 'PAYMENT_PENDING')
         AND payment_provider IS NULL
    `);
  });
}

async function requestDjiwaPayCharge(input: {
  orderId: string;
  amount: number;
  cookie: string;
  secret: string;
}): Promise<DjiwaPayChargeOutcome> {
  const request = buildTravelWalletChargeRequest({
    ...input,
    timestamp: String(Date.now()),
  });
  try {
    const response = await fetch(DJIWA_PAY_TRAVEL_WALLET_ENDPOINT, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null);
    return parseDjiwaPayChargeResponse(response.status, payload);
  } catch {
    return { kind: "pending" };
  }
}

export async function chargeTravelOrderWithDjiwaPayHandler({
  data,
}: {
  data: { orderId: string };
}): Promise<WalletPaymentResult> {
  const { orderId } = walletPaymentInputSchema.parse(data);
  const cookie = await requestCookie();
  const user = await requireBetterAuthUser(cookie);
  const profile = await readCustomerProfile(user);
  if (
    !profile ||
    profile.email.toLowerCase() !== user.email.toLowerCase() ||
    !isCustomerProfileComplete({ email: profile.email, whatsapp: profile.whatsapp })
  ) {
    throw new Error("Lengkapi profil member sebelum membayar dengan saldo Djiwa Pay");
  }

  const secret = process.env["DJIWA_TRAVEL_WALLET_PAYMENT_SECRET"]?.trim() ?? "";
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("Pembayaran saldo Djiwa Pay belum dikonfigurasi");

  const claim = await claimWalletOrder(orderId, user.id);
  if (claim.status === "paid") return { status: "paid", transactionId: claim.transactionId };

  const outcome = await requestDjiwaPayCharge({
    orderId,
    amount: claim.amount,
    cookie,
    secret,
  });
  if (outcome.kind === "paid") {
    try {
      await recordConfirmedWalletPayment(orderId, user.id, outcome.transactionId);
      return { status: "paid", transactionId: outcome.transactionId };
    } catch {
      await recordWalletOutcome(orderId, user.id, { kind: "pending" }).catch(() => undefined);
      return { status: "pending" };
    }
  }

  try {
    await recordWalletOutcome(orderId, user.id, outcome);
  } catch {
    // If Pay's answer was ambiguous, the stable order key makes the next request safe even if
    // Travel could not persist its local reconciliation marker.
    return { status: "pending" };
  }
  if (outcome.kind === "insufficient_balance") return { status: "insufficient_balance" };
  if (outcome.kind === "wallet_blocked") return { status: "wallet_blocked" };
  return { status: "pending" };
}
