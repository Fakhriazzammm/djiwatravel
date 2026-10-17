import {
  pgTable,
  check,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  foreignKey,
  unique,
  jsonb,
  integer,
  bigint,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const esimPriceRules = pgTable(
  "esim_price_rules",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    provider: text().default("esimaccess").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeKey: text("scope_key"),
    markupType: text("markup_type").notNull(),
    markupValue: numeric("markup_value").notNull(),
    currencyCode: text("currency_code").default("IDR").notNull(),
    active: boolean().default(true).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    effectiveUntil: timestamp("effective_until", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "esim_price_rules_scope_type_check",
      sql`scope_type = ANY (ARRAY['global'::text, 'country'::text, 'package'::text])`,
    ),
    check(
      "esim_price_rules_markup_type_check",
      sql`markup_type = ANY (ARRAY['percentage'::text, 'fixed'::text])`,
    ),
    check("esim_price_rules_markup_value_check", sql`markup_value >= (0)::numeric`),
  ],
);

export const esimProfiles = pgTable(
  "esim_profiles",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    provisioningOrderId: uuid("provisioning_order_id").notNull(),
    iccid: text().notNull(),
    esimTranNo: text("esim_tran_no"),
    smdpAddress: text("smdp_address"),
    activationCodeEncrypted: text("activation_code_encrypted"),
    qrPayloadEncrypted: text("qr_payload_encrypted"),
    displayQrAssetUrl: text("display_qr_asset_url"),
    profileStatus: text("profile_status").notNull(),
    installable: boolean("installable").default(false).notNull(),
    providerPayload: jsonb("provider_payload"),
    activatedAt: timestamp("activated_at", { withTimezone: true, mode: "string" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.provisioningOrderId],
      foreignColumns: [esimProvisioningOrders.id],
      name: "esim_profiles_provisioning_order_id_fkey",
    }),
    unique("esim_profiles_iccid_key").on(table.iccid),
  ],
);

export const customerOrderItems = pgTable(
  "customer_order_items",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    orderId: uuid("order_id").notNull(),
    providerPackageId: uuid("provider_package_id"),
    providerPackageCode: text("provider_package_code").notNull(),
    packageNameSnapshot: text("package_name_snapshot"),
    quantity: integer().notNull(),
    providerUnitCost: numeric("provider_unit_cost").notNull(),
    markupUnitAmount: numeric("markup_unit_amount").notNull(),
    sellingUnitPrice: numeric("selling_unit_price").notNull(),
    lineTotal: numeric("line_total").notNull(),
    packageSnapshot: jsonb("package_snapshot").default({}).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [customerOrders.id],
      name: "customer_order_items_order_id_fkey",
    }),
    foreignKey({
      columns: [table.providerPackageId],
      foreignColumns: [esimProviderPackages.id],
      name: "customer_order_items_provider_package_id_fkey",
    }),
    check("customer_order_items_quantity_check", sql`quantity > 0`),
  ],
);

export const esimProviderPackages = pgTable(
  "esim_provider_packages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    provider: text().default("esimaccess").notNull(),
    packageCode: text("package_code").notNull(),
    slug: text(),
    name: text().notNull(),
    locationCodes: jsonb("location_codes").default([]).notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    volumeBytes: bigint("volume_bytes", { mode: "number" }),
    durationDays: integer("duration_days"),
    durationUnit: text("duration_unit"),
    dataType: integer("data_type"),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    priceProviderMinor: bigint("price_provider_minor", { mode: "number" }).notNull(),
    currencyCode: text("currency_code").notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    retailPriceProviderMinor: bigint("retail_price_provider_minor", { mode: "number" }),
    supportTopUpType: integer("support_top_up_type"),
    speed: text(),
    network: jsonb(),
    active: boolean().default(true).notNull(),
    providerPayload: jsonb("provider_payload"),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    unique("esim_provider_packages_provider_package_code_key").on(
      table.provider,
      table.packageCode,
    ),
  ],
);

export const providerWebhookEvents = pgTable(
  "provider_webhook_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    provider: text().default("esimaccess").notNull(),
    notifyId: text("notify_id").notNull(),
    notifyType: text("notify_type").notNull(),
    eventFingerprint: text("event_fingerprint").notNull(),
    payload: jsonb().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
    processingError: text("processing_error"),
    providerEventAt: timestamp("provider_event_at", { withTimezone: true, mode: "string" }),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "string" }),
    dataUsageTotalVolume: numeric("data_usage_total_volume"),
    dataUsageOrderUsage: numeric("data_usage_order_usage"),
    dataUsageRemain: numeric("data_usage_remain"),
    validityUsageTotalDuration: numeric("validity_usage_total_duration"),
    validityUsageExpiredTime: timestamp("validity_usage_expired_time", {
      withTimezone: true,
      mode: "string",
    }),
    validityUsageRemain: numeric("validity_usage_remain"),
  },
  (table) => [
    unique("provider_webhook_events_provider_notify_id_notify_type_key").on(
      table.provider,
      table.notifyId,
      table.notifyType,
    ),
    unique("provider_webhook_events_event_fingerprint_key").on(table.eventFingerprint),
  ],
);

export const esimProvisioningOrders = pgTable(
  "esim_provisioning_orders",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    orderId: uuid("order_id").notNull(),
    provider: text().default("esimaccess").notNull(),
    providerTransactionId: text("provider_transaction_id"),
    providerOrderNo: text("provider_order_no"),
    status: text().default("PENDING").notNull(),
    requestFingerprint: text("request_fingerprint"),
    lastProviderResponse: jsonb("last_provider_response"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    providerStatus: text("provider_status"),
    provisioningAttempts: integer("provisioning_attempts").default(0).notNull(),
    lastProvisioningError: text("last_provisioning_error"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [customerOrders.id],
      name: "esim_provisioning_orders_order_id_fkey",
    }),
    unique("esim_provisioning_orders_order_id_key").on(table.orderId),
    unique("esim_provisioning_orders_provider_transaction_id_key").on(table.providerTransactionId),
    unique("esim_provisioning_orders_provider_order_no_key").on(table.providerOrderNo),
  ],
);

export const customerOrders = pgTable(
  "customer_orders",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    publicOrderCode: text("public_order_code").notNull(),
    customerId: uuid("customer_id"),
    status: text().notNull(),
    currencyCode: text("currency_code").default("IDR").notNull(),
    subtotalAmount: numeric("subtotal_amount").notNull(),
    markupAmount: numeric("markup_amount").notNull(),
    totalAmount: numeric("total_amount").notNull(),
    paymentProvider: text("payment_provider"),
    paymentReference: text("payment_reference"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "string" }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    customerAuthId: uuid("customer_auth_id"),
    // Auth subject V2: Better Auth issues an opaque text subject, so a uuid column could never hold
    // a real session id. New reads/writes use this column; `customerAuthId` is left untouched for
    // historical values. See migrations/012_member_order_identity.sql.
    customerAuthSubject: text("customer_auth_subject"),
    customerAuthLinkedAt: timestamp("customer_auth_linked_at", {
      withTimezone: true,
      mode: "string",
    }),
    priceSnapshot: jsonb("price_snapshot"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true, mode: "string" }),
    esimActivationExpiresAt: timestamp("esim_activation_expires_at", {
      withTimezone: true,
      mode: "string",
    }),
    refundReference: text("refund_reference"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    refundedAt: timestamp("refunded_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("customer_orders_customer_auth_idx").using(
      "btree",
      table.customerAuthId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("uuid_ops"),
    ),
    index("customer_orders_customer_auth_subject_idx").using(
      "btree",
      table.customerAuthSubject.asc().nullsLast().op("text_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("customer_orders_status_expiry_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
      table.expiresAt.asc().nullsLast().op("text_ops"),
    ),
    unique("customer_orders_public_order_code_key").on(table.publicOrderCode),
    unique("customer_orders_idempotency_key_key").on(table.idempotencyKey),
    check(
      "customer_orders_status_check",
      sql`status = ANY (ARRAY['DRAFT'::text, 'ORDER_CREATED'::text, 'PAYMENT_PENDING'::text, 'PAYMENT_CONFIRMED'::text, 'PROVISIONING'::text, 'READY'::text, 'INSTALLED'::text, 'EXPIRED'::text, 'PROVISIONING_FAILED'::text, 'CANCELLED'::text, 'REFUNDED'::text])`,
    ),
  ],
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    provider: text().notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    orderId: uuid("order_id"),
    status: text().notNull(),
    amount: numeric(),
    currencyCode: text("currency_code").default("IDR").notNull(),
    payload: jsonb().notNull(),
    signatureFingerprint: text("signature_fingerprint"),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
    processingError: text("processing_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("payment_webhook_events_order_idx").using(
      "btree",
      table.orderId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [customerOrders.id],
      name: "payment_webhook_events_order_id_fkey",
    }),
    unique("payment_webhook_events_provider_provider_event_id_key").on(
      table.provider,
      table.providerEventId,
    ),
    check(
      "payment_webhook_events_status_check",
      sql`status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'FAILED'::text, 'EXPIRED'::text, 'REFUNDED'::text])`,
    ),
  ],
);

export const esimReconciliationRuns = pgTable(
  "esim_reconciliation_runs",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    orderId: uuid("order_id").notNull(),
    providerOrderNo: text("provider_order_no"),
    previousStatus: text("previous_status").notNull(),
    nextStatus: text("next_status").notNull(),
    attempts: integer().default(1).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("esim_reconciliation_runs_order_idx").using(
      "btree",
      table.orderId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [customerOrders.id],
      name: "esim_reconciliation_runs_order_id_fkey",
    }),
  ],
);

export const guestOrderAccess = pgTable(
  "guest_order_access",
  {
    orderId: uuid("order_id").primaryKey().notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    email: text().notNull(),
    whatsapp: text().notNull(),
    paymentMethod: text("payment_method").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" })
      .default(sql`now() + interval '1 hour'`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [customerOrders.id],
      name: "guest_order_access_order_id_fkey",
    }).onDelete("cascade"),
    unique("guest_order_access_token_hash_key").on(table.accessTokenHash),
    check(
      "guest_order_access_payment_method_check",
      sql`payment_method = ANY (ARRAY['qris'::text, 'va'::text])`,
    ),
  ],
);

export const customerProfiles = pgTable(
  "customer_profiles",
  {
    // Better Auth user id is an opaque text token (32 chars), not a uuid.
    authUserId: text("auth_user_id").primaryKey().notNull(),
    email: text().notNull(),
    whatsapp: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("customer_profiles_email_key").on(table.email),
    check("customer_profiles_whatsapp_check", sql`whatsapp ~ '^[0-9]{9,15}$'`),
  ],
);

/**
 * Claim audit for guest-order import (migration 012). One order is claimed at most once; repeated
 * attempts are recorded with a non-CLAIMED outcome so the history stays inspectable.
 */
export const orderClaimEvents = pgTable(
  "order_claim_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    orderId: uuid("order_id").notNull(),
    customerAuthSubject: text("customer_auth_subject").notNull(),
    outcome: text().notNull(),
    // Fingerprint of the presented bearer token; the token itself is never stored.
    presentedTokenHash: text("presented_token_hash"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("order_claim_events_order_idx").using(
      "btree",
      table.orderId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [customerOrders.id],
      name: "order_claim_events_order_id_fkey",
    }).onDelete("cascade"),
    check(
      "order_claim_events_outcome_check",
      sql`outcome = ANY (ARRAY['CLAIMED'::text, 'ALREADY_MEMBER'::text, 'OWNED_BY_OTHER'::text, 'UNVERIFIED'::text])`,
    ),
  ],
);

/**
 * Durable webhook inbox (migration 013). A transport queue, not a second source of truth: the order
 * row stays authoritative and the unique key makes re-delivery a no-op.
 */
export const webhookInbox = pgTable(
  "webhook_inbox",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    provider: text().notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payload: jsonb().notNull(),
    status: text().notNull().default("RECEIVED"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: "string" }),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "string" }),
    leaseOwner: text("lease_owner"),
    lastErrorSafe: text("last_error_safe"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("webhook_inbox_due_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
      table.nextRetryAt.asc().nullsLast().op("timestamptz_ops"),
      table.receivedAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("webhook_inbox_lease_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
      table.lockedUntil.asc().nullsLast().op("timestamptz_ops"),
    ),
    unique("webhook_inbox_provider_event_id_key").on(table.provider, table.eventId),
    check(
      "webhook_inbox_status_check",
      sql`status = ANY (ARRAY['RECEIVED'::text, 'PROCESSING'::text, 'PROCESSED'::text, 'FAILED'::text, 'DEAD_LETTER'::text])`,
    ),
  ],
);

/**
 * Finance posting outbox (migration 014). A settled order with an unposted ledger entry is a
 * retryable row, never a silent gap. Unique on (order_id, purpose) and on the idempotency key so a
 * retry after an ambiguous timeout cannot double-post.
 */
export const financeOutbox = pgTable(
  "finance_outbox",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    orderId: uuid("order_id").notNull(),
    purpose: text().notNull().default("SETTLEMENT"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text().notNull().default("PENDING"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: "string" }),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "string" }),
    leaseOwner: text("lease_owner"),
    amount: numeric(),
    currencyCode: text("currency_code").default("IDR").notNull(),
    payload: jsonb().notNull(),
    lastErrorSafe: text("last_error_safe"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("finance_outbox_due_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
      table.nextRetryAt.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [customerOrders.id],
      name: "finance_outbox_order_id_fkey",
    }).onDelete("cascade"),
    unique("finance_outbox_order_purpose_key").on(table.orderId, table.purpose),
    unique("finance_outbox_idempotency_key_key").on(table.idempotencyKey),
    check(
      "finance_outbox_status_check",
      sql`status = ANY (ARRAY['PENDING'::text, 'POSTING'::text, 'POSTED'::text, 'FAILED'::text, 'DEAD_LETTER'::text])`,
    ),
    check(
      "finance_outbox_purpose_check",
      sql`purpose = ANY (ARRAY['SETTLEMENT'::text, 'REFUND'::text, 'REVERSAL'::text])`,
    ),
  ],
);

/**
 * Refund audit trail (migration 015). The provider refund adapter stays unimplemented until the
 * Mayar refund contract is verified, so this records the decision and actor only.
 */
export const refundEvents = pgTable(
  "refund_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    orderId: uuid("order_id").notNull(),
    status: text().notNull(),
    amount: numeric(),
    currencyCode: text("currency_code").default("IDR").notNull(),
    actorSubject: text("actor_subject").notNull(),
    reason: text(),
    noteSafe: text("note_safe"),
    idempotencyKey: text("idempotency_key").notNull(),
    provider: text(),
    providerRefundReference: text("provider_refund_reference"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("refund_events_order_idx").using(
      "btree",
      table.orderId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [customerOrders.id],
      name: "refund_events_order_id_fkey",
    }).onDelete("cascade"),
    unique("refund_events_idempotency_key_key").on(table.idempotencyKey),
    check(
      "refund_events_status_check",
      sql`status = ANY (ARRAY['REQUESTED'::text, 'APPROVED'::text, 'REJECTED'::text, 'PROVIDER_PENDING'::text, 'PROVIDER_REFUNDED'::text, 'FINANCE_REVERSED'::text, 'FAILED'::text])`,
    ),
  ],
);

/**
 * Worker liveness (migration 016). Absence of queue rows and a stopped worker look identical in the
 * database, so readiness must read an explicit heartbeat.
 */
export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerName: text("worker_name").primaryKey().notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "string" }),
  lastErrorSafe: text("last_error_safe"),
  migrationVersion: text("migration_version"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
});
