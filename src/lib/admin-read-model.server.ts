import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { requireAdmin } from "@/lib/admin-guard";

const LIMIT = 50;

type Row = Record<string, unknown>;

function text(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function number(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function nullableNumber(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const getAdminOrders = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const result = await db.execute(sql`
    select o.id, o.public_order_code, o.status, o.currency_code, o.total_amount,
           o.payment_provider, o.payment_reference, o.created_at, o.updated_at,
           p.status as provisioning_status, p.provider_status
      from public.customer_orders o
      left join public.esim_provisioning_orders p on p.order_id = o.id
     order by o.created_at desc
     limit ${LIMIT}
  `);
  return (result.rows as Row[]).map((row) => ({
    id: text(row, "id")!,
    publicOrderCode: text(row, "public_order_code")!,
    status: text(row, "status")!,
    currencyCode: text(row, "currency_code")!,
    totalAmount: number(row, "total_amount"),
    paymentProvider: text(row, "payment_provider"),
    paymentReference: text(row, "payment_reference"),
    createdAt: text(row, "created_at")!,
    updatedAt: text(row, "updated_at")!,
    customer: null,
    provisioningStatus: text(row, "provisioning_status"),
    providerStatus: text(row, "provider_status"),
  }));
});

export const getAdminOrderDetail = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const orderResult = await db.execute(sql`
      select o.id, o.public_order_code, o.status, o.currency_code, o.total_amount,
             o.payment_provider, o.payment_reference, o.paid_at, o.created_at, o.updated_at,
             o.payment_expires_at, o.esim_activation_expires_at,
             p.status as provisioning_status, p.provider_status,
             p.provider_order_no, p.attempt_count, p.provisioning_attempts,
             p.last_provisioning_error, p.created_at as provisioning_created_at,
             p.updated_at as provisioning_updated_at
        from public.customer_orders o
        left join public.esim_provisioning_orders p on p.order_id = o.id
       where o.id = ${data.id}::uuid
       limit 1
    `);
    const row = orderResult.rows[0] as Row | undefined;
    if (!row) return null;

    const [itemsResult, webhookResult, providerWebhookResult] = await Promise.all([
      db.execute(sql`
        select package_name_snapshot, provider_package_code, quantity, line_total
          from public.customer_order_items where order_id = ${data.id}::uuid order by id
      `),
      db.execute(sql`
        select provider_event_id, event_type, status, amount, currency_code,
               processed_at, processing_error, created_at
          from public.payment_webhook_events where order_id = ${data.id}::uuid order by created_at desc limit 20
      `),
      db.execute(sql`
        select notify_id, notify_type, processed_at, processing_error, provider_event_at, synced_at
          from public.provider_webhook_events
         where notify_id in (
           select provider_order_no from public.esim_provisioning_orders where order_id = ${data.id}::uuid
         )
         order by coalesce(provider_event_at, synced_at) desc nulls last limit 20
      `),
    ]);

    const paymentWebhooks = (webhookResult.rows as Row[]).map((event) => ({
      eventId: text(event, "provider_event_id"),
      eventType: text(event, "event_type"),
      status: text(event, "status"),
      amount: nullableNumber(event, "amount"),
      currencyCode: text(event, "currency_code"),
      processedAt: text(event, "processed_at"),
      processingError: text(event, "processing_error"),
      createdAt: text(event, "created_at"),
    }));

    return {
      id: text(row, "id")!,
      publicOrderCode: text(row, "public_order_code")!,
      status: text(row, "status")!,
      currencyCode: text(row, "currency_code")!,
      totalAmount: number(row, "total_amount"),
      paymentProvider: text(row, "payment_provider"),
      paymentReference: text(row, "payment_reference"),
      paidAt: text(row, "paid_at"),
      createdAt: text(row, "created_at")!,
      updatedAt: text(row, "updated_at")!,
      paymentExpiresAt: text(row, "payment_expires_at"),
      esimActivationExpiresAt: text(row, "esim_activation_expires_at"),
      customer: null,
      provisioning: {
        status: text(row, "provisioning_status"),
        providerStatus: text(row, "provider_status"),
        attemptCount: number(row, "attempt_count"),
        provisioningAttempts: number(row, "provisioning_attempts"),
        lastError: text(row, "last_provisioning_error"),
        createdAt: text(row, "provisioning_created_at"),
        updatedAt: text(row, "provisioning_updated_at"),
      },
      items: (itemsResult.rows as Row[]).map((item) => ({
        packageName: text(item, "package_name_snapshot") ?? text(item, "provider_package_code"),
        quantity: number(item, "quantity"),
        lineTotal: number(item, "line_total"),
      })),
      payment: {
        status: paymentWebhooks[0]?.status ?? (text(row, "paid_at") ? "PAID" : null),
        provider: text(row, "payment_provider"),
        reference: text(row, "payment_reference"),
        paidAt: text(row, "paid_at"),
        webhooks: paymentWebhooks,
      },
      providerWebhooks: (providerWebhookResult.rows as Row[]).map((event) => ({
        notifyId: text(event, "notify_id"),
        notifyType: text(event, "notify_type"),
        processedAt: text(event, "processed_at"),
        processingError: text(event, "processing_error"),
        providerEventAt: text(event, "provider_event_at"),
        syncedAt: text(event, "synced_at"),
      })),
    };
  });

export const getAdminPayments = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const result = await db.execute(sql`
    with payment_exceptions as (
      select w.id::text as id, w.order_id, o.public_order_code,
             w.status, w.amount, w.currency_code, w.processing_error as last_error,
             w.created_at, w.created_at as updated_at
        from public.payment_webhook_events w
        join public.customer_orders o on o.id = w.order_id
       where w.processing_error is not null
          or w.processed_at is null
          or w.status in ('FAILED', 'EXPIRED')
      union all
      select ('pending:' || o.id::text) as id, o.id as order_id, o.public_order_code,
             o.status, o.total_amount as amount, o.currency_code,
             null::text as last_error, o.updated_at as created_at, o.updated_at
        from public.customer_orders o
       where o.status = 'PAYMENT_PENDING'
         and not exists (
           select 1 from public.payment_webhook_events w
            where w.order_id = o.id and w.status = 'PAID'
         )
    )
    select id, order_id, public_order_code, status, amount, currency_code,
           null::int as attempt_count, null::timestamptz as next_reconcile_at,
           last_error, created_at, updated_at
      from payment_exceptions
     order by updated_at desc limit ${LIMIT}
  `);
  return (result.rows as Row[]).map((row) => ({
    id: text(row, "id")!,
    orderId: text(row, "order_id")!,
    publicOrderCode: text(row, "public_order_code")!,
    status: text(row, "status")!,
    amount: nullableNumber(row, "amount"),
    currencyCode: text(row, "currency_code"),
    attemptCount: nullableNumber(row, "attempt_count"),
    nextReconcileAt: text(row, "next_reconcile_at"),
    lastError: text(row, "last_error"),
    createdAt: text(row, "created_at")!,
    updatedAt: text(row, "updated_at")!,
  }));
});

export const getAdminProvisioning = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const result = await db.execute(sql`
    select p.id, p.order_id, o.public_order_code, o.status as order_status,
           p.status, p.provider_status, p.attempt_count, p.provisioning_attempts,
           p.last_provisioning_error, p.next_retry_at, p.created_at, p.updated_at
      from public.esim_provisioning_orders p join public.customer_orders o on o.id = p.order_id
     where p.status in ('PENDING','PROVISIONING','FAILED') or (o.status in ('PAYMENT_CONFIRMED','PROVISIONING_FAILED') and p.id is not null)
     order by p.updated_at desc limit ${LIMIT}
  `);
  return (result.rows as Row[]).map((row) => ({
    id: text(row, "id")!,
    orderId: text(row, "order_id")!,
    publicOrderCode: text(row, "public_order_code")!,
    orderStatus: text(row, "order_status")!,
    status: text(row, "status")!,
    providerStatus: text(row, "provider_status"),
    attemptCount: number(row, "attempt_count"),
    provisioningAttempts: number(row, "provisioning_attempts"),
    lastError: text(row, "last_provisioning_error"),
    nextRetryAt: text(row, "next_retry_at"),
    createdAt: text(row, "created_at")!,
    updatedAt: text(row, "updated_at")!,
  }));
});

export const getAdminDashboard = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const result = await db.execute(sql`
    select
      count(*) filter (where status = 'ORDER_CREATED')::int as new_orders,
      count(*) filter (where status = 'PAYMENT_PENDING')::int as pending_orders,
      count(*) filter (where status = 'PROVISIONING_FAILED')::int as failed_provisioning,
      count(*) filter (where status = 'PAYMENT_CONFIRMED')::int as paid_not_started
      from public.customer_orders
  `);
  const [paymentResult, exceptionResult] = await Promise.all([
    db.execute(sql`
      select count(*)::int as count
        from public.payment_webhook_events w
       where w.processing_error is not null
          or w.processed_at is null
          or w.status in ('FAILED', 'EXPIRED')
    `),
    db.execute(sql`
      with exceptions as (
        select o.id, o.public_order_code, o.status, o.updated_at, 'order' as kind
          from public.customer_orders o
         where o.status in ('ORDER_CREATED','PAYMENT_PENDING','PAYMENT_CONFIRMED','PROVISIONING_FAILED')
        union all
        select w.order_id as id, o.public_order_code, w.status, w.created_at as updated_at, 'payment' as kind
          from public.payment_webhook_events w
          join public.customer_orders o on o.id = w.order_id
         where w.processing_error is not null or w.processed_at is null or w.status in ('FAILED','EXPIRED')
      )
      select id, public_order_code, status, kind, updated_at
        from exceptions
       order by updated_at desc limit ${LIMIT}
    `),
  ]);
  const row = result.rows[0] as Row | undefined;
  return {
    counts: {
      newOrders: number(row ?? {}, "new_orders"),
      pendingOrders: number(row ?? {}, "pending_orders"),
      failedProvisioning: number(row ?? {}, "failed_provisioning"),
      paidNotStarted: number(row ?? {}, "paid_not_started"),
      paymentExceptions: number((paymentResult.rows[0] as Row | undefined) ?? {}, "count"),
    },
    items: (exceptionResult.rows as Row[]).map((item) => ({
      id: text(item, "id")!,
      publicOrderCode: text(item, "public_order_code")!,
      status: text(item, "status")!,
      kind: text(item, "kind")!,
      updatedAt: text(item, "updated_at")!,
    })),
  };
});
