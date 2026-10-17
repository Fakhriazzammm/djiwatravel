import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { requireAdmin } from "@/lib/admin-guard";
import { classifyAdminError, maskReference, toAdminCustomer } from "@/lib/admin-display";
import { normalizePaymentQuery, type PaymentQuery } from "@/lib/admin-metrics";
import { RESELLER_CONFIG } from "@/lib/reseller-config";
import { fetchEsimAccessBalanceServer, type ProviderBalance } from "@/lib/esim-access";
import { affordableCeilingUsd, sellabilityMode, type BalanceSnapshot } from "@/lib/sellability";

const LIMIT = 50;

/** Provider credit as shown to admins: never includes keys, only the balance and a reference rate. */
export type ProviderBalanceView = {
  state: "ok" | "unavailable";
  usd: number | null;
  idrReference: number | null;
  fxRateIdr: number;
  fetchedAt: string | null;
  error: string | null;
  /** Priciest package still sellable at this balance (buffer included); null when unknown. */
  sellableCeilingUsd: number | null;
  sellabilityMode: "off" | "shadow" | "on";
};

// Browser display values must come from this allowlist, never provider input.
function paymentProviderLabel(row: Row): "Mayar" | null {
  return text(row, "payment_provider") === "mayar" ? "Mayar" : null;
}

function safeEventType(row: Row, key: string, allowed: readonly string[]): string | null {
  const value = text(row, key);
  return value && allowed.includes(value) ? value : null;
}

const safeError = (row: Row, key: string) => classifyAdminError(text(row, key));
// Compatibility contract: unavailable reconcile fields remain explicitly unknown: null::int as attempt_count, null::timestamptz as next_reconcile_at.

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

export function toSafeAdminPaymentWebhook(event: Row) {
  return {
    eventType: safeEventType(event, "event_type", ["payment.received", "payment_pending"]),
    status: safeEventType(event, "status", ["PAID", "PENDING", "FAILED", "EXPIRED"]),
    amount: nullableNumber(event, "amount"),
    currencyCode: text(event, "currency_code"),
    processedAt: text(event, "processed_at"),
    processingError: safeError(event, "processing_error"),
    createdAt: text(event, "created_at"),
  };
}

export function toSafeAdminProviderWebhook(event: Row) {
  return {
    notifyType: safeEventType(event, "notify_type", [
      "ORDER_STATUS",
      "ESIM_STATUS",
      "DATA_USAGE",
      "VALIDITY_USAGE",
      "SMDP_EVENT",
    ]),
    processedAt: text(event, "processed_at"),
    processingError: safeError(event, "processing_error"),
    providerEventAt: text(event, "provider_event_at"),
    syncedAt: text(event, "synced_at"),
  };
}

export const getAdminOrders = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const result = await db.execute(sql`
    select o.id, o.public_order_code, o.status, o.currency_code, o.total_amount,
           o.payment_provider, o.payment_reference, o.created_at, o.updated_at,
           p.status as provisioning_status,
           a.email as customer_email, a.whatsapp as customer_whatsapp,
           items.item_summary
      from public.customer_orders o
      left join public.esim_provisioning_orders p on p.order_id = o.id
      left join public.guest_order_access a on a.order_id = o.id
      left join lateral (
        select string_agg(coalesce(package_name_snapshot, 'Paket belum tersedia') || ' × ' || quantity::text, ', ' order by id) as item_summary
          from public.customer_order_items where order_id = o.id
      ) items on true
     order by o.created_at desc
     limit ${LIMIT}
  `);
  return (result.rows as Row[]).map((row) => ({
    detailHref: `/admin/orders/${text(row, "id")!}`,
    displayIdentifier: maskReference(text(row, "public_order_code")),
    status: text(row, "status")!,
    currencyCode: text(row, "currency_code")!,
    totalAmount: number(row, "total_amount"),
    paymentProviderLabel: paymentProviderLabel(row),
    paymentReference: maskReference(text(row, "payment_reference")),
    createdAt: text(row, "created_at")!,
    updatedAt: text(row, "updated_at")!,
    customer: toAdminCustomer(text(row, "customer_email"), text(row, "customer_whatsapp")),
    itemSummary: text(row, "item_summary"),
    provisioningStatus: text(row, "provisioning_status"),
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
             p.status as provisioning_status,
             p.attempt_count, p.provisioning_attempts,
             p.last_provisioning_error, p.created_at as provisioning_created_at,
             p.updated_at as provisioning_updated_at,
             a.email as customer_email, a.whatsapp as customer_whatsapp
        from public.customer_orders o
        left join public.esim_provisioning_orders p on p.order_id = o.id
        left join public.guest_order_access a on a.order_id = o.id
       where o.id = ${data.id}::uuid
       limit 1
    `);
    const row = orderResult.rows[0] as Row | undefined;
    if (!row) return null;

    const [itemsResult, webhookResult, providerWebhookResult] = await Promise.all([
      db.execute(sql`
        select package_name_snapshot, quantity, line_total
          from public.customer_order_items where order_id = ${data.id}::uuid order by id
      `),
      db.execute(sql`
        select event_type, status, amount, currency_code,
               processed_at, processing_error, created_at
          from public.payment_webhook_events where order_id = ${data.id}::uuid order by created_at desc limit 20
      `),
      db.execute(sql`
        select notify_type, processed_at, processing_error, provider_event_at, synced_at
          from public.provider_webhook_events
         where notify_id in (
           select provider_order_no from public.esim_provisioning_orders where order_id = ${data.id}::uuid
         )
         order by coalesce(provider_event_at, synced_at) desc nulls last limit 20
      `),
    ]);

    const paymentWebhooks = (webhookResult.rows as Row[]).map(toSafeAdminPaymentWebhook);

    return {
      displayIdentifier: maskReference(text(row, "public_order_code")),
      status: text(row, "status")!,
      currencyCode: text(row, "currency_code")!,
      totalAmount: number(row, "total_amount"),
      paymentProviderLabel: paymentProviderLabel(row),
      paymentReference: maskReference(text(row, "payment_reference")),
      paidAt: text(row, "paid_at"),
      createdAt: text(row, "created_at")!,
      updatedAt: text(row, "updated_at")!,
      paymentExpiresAt: text(row, "payment_expires_at"),
      esimActivationExpiresAt: text(row, "esim_activation_expires_at"),
      customer: toAdminCustomer(text(row, "customer_email"), text(row, "customer_whatsapp")),
      provisioning: {
        status: text(row, "provisioning_status"),
        attemptCount: number(row, "attempt_count"),
        provisioningAttempts: number(row, "provisioning_attempts"),
        lastError: safeError(row, "last_provisioning_error"),
        createdAt: text(row, "provisioning_created_at"),
        updatedAt: text(row, "provisioning_updated_at"),
      },
      items: (itemsResult.rows as Row[]).map((item) => ({
        packageName: text(item, "package_name_snapshot") ?? "Paket belum tersedia",
        quantity: number(item, "quantity"),
        lineTotal: number(item, "line_total"),
      })),
      payment: {
        status: paymentWebhooks[0]?.status ?? (text(row, "paid_at") ? "PAID" : null),
        providerLabel: paymentProviderLabel(row),
        reference: maskReference(text(row, "payment_reference")),
        paidAt: text(row, "paid_at"),
        webhooks: paymentWebhooks,
      },
      providerWebhooks: (providerWebhookResult.rows as Row[]).map(toSafeAdminProviderWebhook),
    };
  });

const paymentSortSql: Record<PaymentQuery["sort"], string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  amount: "amount",
  status: "status",
};

export const getAdminPayments = createServerFn({ method: "GET" })
  .validator((data: Partial<PaymentQuery> = {}) => normalizePaymentQuery(data))
  .handler(async ({ data }) => {
    await requireAdmin();
    const query = normalizePaymentQuery(data);
    const search = query.query ? `%${query.query.replace(/[%_]/g, "\\$&")}%` : null;
    const filters = [
      query.status !== "ALL" ? sql`status = ${query.status}` : sql`true`,
      search
        ? sql`(public_order_code ilike ${search} or status ilike ${search} or event_type ilike ${search} or coalesce(payment_provider, '') ilike ${search})`
        : sql`true`,
    ];
    const where = sql.join(filters, sql` and `);
    const sortColumn = paymentSortSql[query.sort];
    const direction = query.dir === "asc" ? sql.raw("asc") : sql.raw("desc");
    const base = sql`
      with payment_exceptions as (
        select w.id::text as id, w.order_id, o.public_order_code,
               w.status, w.event_type, w.amount, w.currency_code, w.processing_error as last_error,
               o.payment_provider, o.payment_reference, o.created_at as order_created_at,
               o.updated_at as order_updated_at, w.created_at, coalesce(w.processed_at, w.created_at) as updated_at,
               a.email as customer_email, a.whatsapp as customer_whatsapp, items.item_summary
          from public.payment_webhook_events w
          join public.customer_orders o on o.id = w.order_id
          left join public.guest_order_access a on a.order_id = o.id
          left join lateral (select string_agg(coalesce(package_name_snapshot, 'Paket belum tersedia') || ' × ' || quantity::text, ', ' order by id) item_summary from public.customer_order_items where order_id = o.id) items on true
         where w.processing_error is not null or w.processed_at is null or w.status in ('FAILED', 'EXPIRED')
        union all
        select ('pending:' || o.id::text) as id, o.id as order_id, o.public_order_code,
               o.status, 'payment_pending'::text as event_type, o.total_amount as amount, o.currency_code,
               null::text as last_error, o.payment_provider, o.payment_reference, o.created_at,
               o.updated_at, o.updated_at as created_at, o.updated_at,
               a.email as customer_email, a.whatsapp as customer_whatsapp, items.item_summary
          from public.customer_orders o
          left join public.guest_order_access a on a.order_id = o.id
          left join lateral (select string_agg(coalesce(package_name_snapshot, 'Paket belum tersedia') || ' × ' || quantity::text, ', ' order by id) item_summary from public.customer_order_items where order_id = o.id) items on true
         where o.status = 'PAYMENT_PENDING' and not exists (select 1 from public.payment_webhook_events w where w.order_id = o.id and w.status = 'PAID')
      )
    `;
    const [countResult, result] = await Promise.all([
      db.execute(sql`${base} select count(*)::int as total from payment_exceptions where ${where}`),
      db.execute(
        sql`${base} select * from payment_exceptions where ${where} order by ${sql.raw(sortColumn)} ${direction}, id desc limit ${query.pageSize} offset ${query.page * query.pageSize}`,
      ),
    ]);
    const rows = result.rows as Row[];
    const total = Number((countResult.rows[0] as Row | undefined)?.["total"] ?? 0);
    return {
      rows: rows.map((row) => ({
        displayIdentifier: maskReference(text(row, "id")),
        detailHref: `/admin/orders/${text(row, "order_id")!}`,
        status: text(row, "status")!,
        amount: nullableNumber(row, "amount"),
        currencyCode: text(row, "currency_code"),
        eventType: safeEventType(row, "event_type", ["payment.received", "payment_pending"]),
        paymentProviderLabel: paymentProviderLabel(row),
        paymentReference: maskReference(text(row, "payment_reference")),
        itemSummary: text(row, "item_summary"),
        orderCreatedAt: text(row, "order_created_at"),
        orderUpdatedAt: text(row, "order_updated_at"),
        attemptCount: nullableNumber(row, "attempt_count"),
        nextReconcileAt: text(row, "next_reconcile_at"),
        lastError: safeError(row, "last_error"),
        createdAt: text(row, "created_at")!,
        updatedAt: text(row, "updated_at")!,
        exceptionAt: text(row, "updated_at")!,
        customer: toAdminCustomer(text(row, "customer_email"), text(row, "customer_whatsapp")),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: (query.page + 1) * query.pageSize < total,
    };
  });

export const getAdminProvisioning = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const result = await db.execute(sql`
    select p.id, p.order_id, o.public_order_code, o.status as order_status,
           p.status, p.attempt_count, p.provisioning_attempts,
           p.last_provisioning_error, p.next_retry_at, p.created_at, p.updated_at,
           a.email as customer_email, a.whatsapp as customer_whatsapp
      from public.esim_provisioning_orders p join public.customer_orders o on o.id = p.order_id
      left join public.guest_order_access a on a.order_id = p.order_id
     where p.status in ('PENDING','PROVISIONING','FAILED') or (o.status in ('PAYMENT_CONFIRMED','PROVISIONING_FAILED') and p.id is not null)
     order by p.updated_at desc limit ${LIMIT}
  `);
  return (result.rows as Row[]).map((row) => ({
    detailHref: `/admin/orders/${text(row, "order_id")!}`,
    displayIdentifier: maskReference(text(row, "public_order_code")),
    orderStatus: text(row, "order_status")!,
    status: text(row, "status")!,
    attemptCount: number(row, "attempt_count"),
    provisioningAttempts: number(row, "provisioning_attempts"),
    lastError: safeError(row, "last_provisioning_error"),
    nextRetryAt: text(row, "next_retry_at"),
    createdAt: text(row, "created_at")!,
    updatedAt: text(row, "updated_at")!,
    customer: toAdminCustomer(text(row, "customer_email"), text(row, "customer_whatsapp")),
  }));
});

export const getAdminSupportCases = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const result = await db.execute(sql`
    select c.id, c.public_case_code, c.category, c.subject, c.description,
           c.status, c.priority, c.order_id, c.created_at, c.updated_at,
           m.body as latest_message, m.author_type as latest_author_type
      from public.support_cases c
      left join lateral (
        select body, author_type from public.support_case_messages
         where case_id = c.id order by created_at desc limit 1
      ) m on true
     order by c.updated_at desc limit ${LIMIT}
  `);
  return (result.rows as Row[]).map((row) => ({
    id: text(row, "id")!,
    caseCode: text(row, "public_case_code")!,
    category: text(row, "category")!,
    subject: text(row, "subject")!,
    description: text(row, "description")!,
    status: text(row, "status")!,
    priority: text(row, "priority")!,
    orderId: maskReference(text(row, "order_id")),
    latestMessage: text(row, "latest_message"),
    latestAuthorType: text(row, "latest_author_type"),
    createdAt: text(row, "created_at")!,
    updatedAt: text(row, "updated_at")!,
  }));
});

export const getAdminRefundRequests = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const result = await db.execute(sql`
    select r.id, r.order_id, o.public_order_code, o.status as order_status,
           o.currency_code, o.total_amount, r.status, r.eligibility_snapshot,
           r.created_at, r.updated_at, r.provider_error,
           (select count(*)::int from public.refund_events e where e.order_id = r.order_id) as event_count
      from public.refund_requests r
      join public.customer_orders o on o.id = r.order_id
     order by r.updated_at desc limit ${LIMIT}
  `);
  return (result.rows as Row[]).map((row) => ({
    id: maskReference(text(row, "id")),
    orderCode: maskReference(text(row, "public_order_code")),
    orderId: text(row, "order_id")!,
    orderStatus: text(row, "order_status")!,
    status: text(row, "status")!,
    currencyCode: text(row, "currency_code"),
    amount: nullableNumber(row, "total_amount"),
    eligibility: text(row, "eligibility_snapshot"),
    providerError: safeError(row, "provider_error"),
    eventCount: number(row, "event_count"),
    createdAt: text(row, "created_at")!,
    updatedAt: text(row, "updated_at")!,
  }));
});

export const getAdminDashboard = createServerFn({ method: "GET" })
  .validator((data: { period?: "daily" | "weekly" | "monthly" } = {}) => ({
    period: data.period ?? "daily",
  }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const period = data.period;
    const periodStart =
      period === "daily"
        ? sql`date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'`
        : period === "weekly"
          ? sql`date_trunc('week', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'`
          : sql`date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'`;
    const periodEnd =
      period === "daily"
        ? sql`${periodStart} + interval '1 day'`
        : period === "weekly"
          ? sql`${periodStart} + interval '7 days'`
          : sql`${periodStart} + interval '1 month'`;
    const [
      countResult,
      dailyResult,
      statusResult,
      exceptionResult,
      paymentExceptionCountResult,
      freshnessResult,
    ] = await Promise.all([
      db.execute(
        sql`select count(*)::int as total, count(*) filter (where paid_at is not null or status in ('PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED'))::int as paid, coalesce(sum(total_amount) filter (where currency_code = 'IDR' and (paid_at is not null or status in ('PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED'))),0)::numeric as gross_idr, count(*) filter (where status in ('READY','INSTALLED'))::int as provisioning_ready, count(*) filter (where status = 'PROVISIONING_FAILED')::int as provisioning_failed, count(*) filter (where status in ('PAYMENT_CONFIRMED','PROVISIONING'))::int as paid_not_ready from public.customer_orders where created_at >= ${periodStart} and created_at < ${periodEnd}`,
      ),
      db.execute(
        sql`select date_trunc('day', created_at at time zone 'Asia/Jakarta')::date::text as day, count(*)::int as count from public.customer_orders where created_at >= ${periodStart} and created_at < ${periodEnd} group by 1 order by 1`,
      ),
      db.execute(
        sql`select status, count(*)::int as count from public.customer_orders where created_at >= ${periodStart} and created_at < ${periodEnd} group by status order by count desc`,
      ),
      db.execute(
        sql`with exceptions as (select o.id, o.public_order_code, o.status, o.total_amount as amount, o.currency_code, o.updated_at as exception_at, 'order' as kind, a.email as customer_email, a.whatsapp as customer_whatsapp from public.customer_orders o left join public.guest_order_access a on a.order_id=o.id where o.created_at >= ${periodStart} and o.created_at < ${periodEnd} and o.status in ('ORDER_CREATED','PAYMENT_PENDING','PAYMENT_CONFIRMED','PROVISIONING_FAILED') union all select w.order_id, o.public_order_code, w.status, w.amount, w.currency_code, w.created_at, 'payment', a.email, a.whatsapp from public.payment_webhook_events w join public.customer_orders o on o.id=w.order_id left join public.guest_order_access a on a.order_id=o.id where o.created_at >= ${periodStart} and o.created_at < ${periodEnd} and (w.processing_error is not null or w.processed_at is null or w.status in ('FAILED','EXPIRED'))) select * from exceptions order by exception_at desc limit ${LIMIT}`,
      ),
      db.execute(
        sql`select count(*)::int as total from public.payment_webhook_events w join public.customer_orders o on o.id=w.order_id where o.created_at >= ${periodStart} and o.created_at < ${periodEnd} and (w.processing_error is not null or w.processed_at is null or w.status in ('FAILED','EXPIRED'))`,
      ),
      db.execute(
        sql`select greatest(max(updated_at), max(created_at))::text as last_data_at from public.customer_orders where created_at >= ${periodStart} and created_at < ${periodEnd}`,
      ),
    ]);
    const row = (countResult.rows[0] as Row | undefined) ?? {};
    return {
      period,
      updatedAt: text((freshnessResult.rows[0] as Row | undefined) ?? {}, "last_data_at"),
      counts: {
        total: number(row, "total"),
        paid: number(row, "paid"),
        grossIdr: nullableNumber(row, "gross_idr"),
        paymentExceptions: number(
          (paymentExceptionCountResult.rows[0] as Row | undefined) ?? {},
          "total",
        ),
        provisioningReady: number(row, "provisioning_ready"),
        provisioningFailed: number(row, "provisioning_failed"),
        paidNotReady: number(row, "paid_not_ready"),
      },
      daily: (dailyResult.rows as Row[]).map((r) => ({
        day: text(r, "day")!,
        count: number(r, "count"),
      })),
      statuses: (statusResult.rows as Row[]).map((r) => ({
        status: text(r, "status")!,
        count: number(r, "count"),
      })),
      items: (exceptionResult.rows as Row[]).map((item) => ({
        detailHref: `/admin/orders/${text(item, "id")!}`,
        displayIdentifier: maskReference(text(item, "public_order_code")),
        status: text(item, "status")!,
        kind: text(item, "kind")!,
        amount: nullableNumber(item, "amount"),
        currencyCode: text(item, "currency_code"),
        exceptionAt: text(item, "exception_at")!,
        customer: toAdminCustomer(text(item, "customer_email"), text(item, "customer_whatsapp")),
      })),
      providerBalance: await loadAdminProviderBalance(RESELLER_CONFIG.usdToIdr),
    };
  });

/** Provider credit shown on the dashboard; never throws, so the dashboard still renders. */
async function loadAdminProviderBalance(fxRateIdr: number): Promise<ProviderBalanceView> {
  const mode = sellabilityMode();
  try {
    const balance = await fetchEsimAccessBalanceServer();
    const snapshot: BalanceSnapshot = {
      balanceUnits: balance.balanceUnits,
      capturedAtMs: Date.now(),
      source: "live",
    };
    return {
      state: "ok",
      usd: balance.usd,
      idrReference: balance.idrReference,
      fxRateIdr: balance.fxRateIdr,
      fetchedAt: balance.fetchedAt,
      error: null,
      sellableCeilingUsd: affordableCeilingUsd(snapshot),
      sellabilityMode: mode,
    };
  } catch (error) {
    return {
      state: "unavailable",
      usd: null,
      idrReference: null,
      fxRateIdr,
      fetchedAt: null,
      error: classifyAdminError(error instanceof Error ? error.message : String(error)) ?? "processing_failed",
      sellableCeilingUsd: null,
      sellabilityMode: mode,
    };
  }
}
