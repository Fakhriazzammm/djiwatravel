import { pgTable, check, uuid, text, numeric, boolean, timestamp, foreignKey, unique, jsonb, integer, bigint, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const esimPriceRules = pgTable("esim_price_rules", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	provider: text().default('esimaccess').notNull(),
	scopeType: text("scope_type").notNull(),
	scopeKey: text("scope_key"),
	markupType: text("markup_type").notNull(),
	markupValue: numeric("markup_value").notNull(),
	currencyCode: text("currency_code").default('IDR').notNull(),
	active: boolean().default(true).notNull(),
	effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	effectiveUntil: timestamp("effective_until", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("esim_price_rules_scope_type_check", sql`scope_type = ANY (ARRAY['global'::text, 'country'::text, 'package'::text])`),
	check("esim_price_rules_markup_type_check", sql`markup_type = ANY (ARRAY['percentage'::text, 'fixed'::text])`),
	check("esim_price_rules_markup_value_check", sql`markup_value >= (0)::numeric`),
]);

export const esimProfiles = pgTable("esim_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	provisioningOrderId: uuid("provisioning_order_id").notNull(),
	iccid: text().notNull(),
	esimTranNo: text("esim_tran_no"),
	smdpAddress: text("smdp_address"),
	activationCodeEncrypted: text("activation_code_encrypted"),
	qrPayloadEncrypted: text("qr_payload_encrypted"),
	displayQrAssetUrl: text("display_qr_asset_url"),
	profileStatus: text("profile_status").notNull(),
	providerPayload: jsonb("provider_payload"),
	activatedAt: timestamp("activated_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.provisioningOrderId],
			foreignColumns: [esimProvisioningOrders.id],
			name: "esim_profiles_provisioning_order_id_fkey"
		}),
	unique("esim_profiles_iccid_key").on(table.iccid),
]);

export const customerOrderItems = pgTable("customer_order_items", {
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
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [customerOrders.id],
			name: "customer_order_items_order_id_fkey"
		}),
	foreignKey({
			columns: [table.providerPackageId],
			foreignColumns: [esimProviderPackages.id],
			name: "customer_order_items_provider_package_id_fkey"
		}),
	check("customer_order_items_quantity_check", sql`quantity > 0`),
]);

export const esimProviderPackages = pgTable("esim_provider_packages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	provider: text().default('esimaccess').notNull(),
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
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("esim_provider_packages_provider_package_code_key").on(table.provider, table.packageCode),
]);

export const providerWebhookEvents = pgTable("provider_webhook_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	provider: text().default('esimaccess').notNull(),
	notifyId: text("notify_id").notNull(),
	notifyType: text("notify_type").notNull(),
	eventFingerprint: text("event_fingerprint").notNull(),
	payload: jsonb().notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
	processingError: text("processing_error"),
}, (table) => [
	unique("provider_webhook_events_provider_notify_id_notify_type_key").on(table.provider, table.notifyId, table.notifyType),
	unique("provider_webhook_events_event_fingerprint_key").on(table.eventFingerprint),
]);

export const esimProvisioningOrders = pgTable("esim_provisioning_orders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orderId: uuid("order_id").notNull(),
	provider: text().default('esimaccess').notNull(),
	providerTransactionId: text("provider_transaction_id"),
	providerOrderNo: text("provider_order_no"),
	status: text().default('PENDING').notNull(),
	requestFingerprint: text("request_fingerprint"),
	lastProviderResponse: jsonb("last_provider_response"),
	attemptCount: integer("attempt_count").default(0).notNull(),
	nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	providerStatus: text("provider_status"),
	provisioningAttempts: integer("provisioning_attempts").default(0).notNull(),
	lastProvisioningError: text("last_provisioning_error"),
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [customerOrders.id],
			name: "esim_provisioning_orders_order_id_fkey"
		}),
	unique("esim_provisioning_orders_order_id_key").on(table.orderId),
	unique("esim_provisioning_orders_provider_transaction_id_key").on(table.providerTransactionId),
	unique("esim_provisioning_orders_provider_order_no_key").on(table.providerOrderNo),
]);

export const customerOrders = pgTable("customer_orders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	publicOrderCode: text("public_order_code").notNull(),
	customerId: uuid("customer_id"),
	status: text().notNull(),
	currencyCode: text("currency_code").default('IDR').notNull(),
	subtotalAmount: numeric("subtotal_amount").notNull(),
	markupAmount: numeric("markup_amount").notNull(),
	totalAmount: numeric("total_amount").notNull(),
	paymentProvider: text("payment_provider"),
	paymentReference: text("payment_reference"),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: 'string' }),
	idempotencyKey: text("idempotency_key").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	customerAuthId: uuid("customer_auth_id"),
	priceSnapshot: jsonb("price_snapshot"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	refundReference: text("refund_reference"),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
	refundedAt: timestamp("refunded_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("customer_orders_customer_auth_idx").using("btree", table.customerAuthId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("customer_orders_status_expiry_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.expiresAt.asc().nullsLast().op("text_ops")),
	unique("customer_orders_public_order_code_key").on(table.publicOrderCode),
	unique("customer_orders_idempotency_key_key").on(table.idempotencyKey),
	check("customer_orders_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'ORDER_CREATED'::text, 'PAYMENT_PENDING'::text, 'PAYMENT_CONFIRMED'::text, 'PROVISIONING'::text, 'READY'::text, 'INSTALLED'::text, 'EXPIRED'::text, 'PROVISIONING_FAILED'::text, 'CANCELLED'::text, 'REFUNDED'::text])`),
]);

export const paymentWebhookEvents = pgTable("payment_webhook_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	provider: text().notNull(),
	providerEventId: text("provider_event_id").notNull(),
	eventType: text("event_type").notNull(),
	orderId: uuid("order_id"),
	status: text().notNull(),
	amount: numeric(),
	currencyCode: text("currency_code").default('IDR').notNull(),
	payload: jsonb().notNull(),
	signatureFingerprint: text("signature_fingerprint"),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
	processingError: text("processing_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("payment_webhook_events_order_idx").using("btree", table.orderId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [customerOrders.id],
			name: "payment_webhook_events_order_id_fkey"
		}),
	unique("payment_webhook_events_provider_provider_event_id_key").on(table.provider, table.providerEventId),
	check("payment_webhook_events_status_check", sql`status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'FAILED'::text, 'EXPIRED'::text, 'REFUNDED'::text])`),
]);

export const esimReconciliationRuns = pgTable("esim_reconciliation_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orderId: uuid("order_id").notNull(),
	providerOrderNo: text("provider_order_no"),
	previousStatus: text("previous_status").notNull(),
	nextStatus: text("next_status").notNull(),
	attempts: integer().default(1).notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("esim_reconciliation_runs_order_idx").using("btree", table.orderId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [customerOrders.id],
			name: "esim_reconciliation_runs_order_id_fkey"
		}),
]);

export const guestOrderAccess = pgTable("guest_order_access", {
	orderId: uuid("order_id").primaryKey().notNull(),
	accessTokenHash: text("access_token_hash").notNull(),
	email: text().notNull(),
	whatsapp: text().notNull(),
	paymentMethod: text("payment_method").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [customerOrders.id],
			name: "guest_order_access_order_id_fkey"
		}).onDelete("cascade"),
	unique("guest_order_access_token_hash_key").on(table.accessTokenHash),
	check("guest_order_access_payment_method_check", sql`payment_method = ANY (ARRAY['qris'::text, 'va'::text])`),
]);

export const customerProfiles = pgTable("customer_profiles", {
	// Better Auth user id is an opaque text token (32 chars), not a uuid.
	authUserId: text("auth_user_id").primaryKey().notNull(),
	email: text().notNull(),
	whatsapp: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("customer_profiles_email_key").on(table.email),
	check("customer_profiles_whatsapp_check", sql`whatsapp ~ '^[0-9]{9,15}$'`),
]);
