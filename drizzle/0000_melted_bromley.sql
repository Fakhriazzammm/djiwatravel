-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "esim_price_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'esimaccess' NOT NULL,
	"scope_type" text NOT NULL,
	"scope_key" text,
	"markup_type" text NOT NULL,
	"markup_value" numeric NOT NULL,
	"currency_code" text DEFAULT 'IDR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "esim_price_rules_scope_type_check" CHECK (scope_type = ANY (ARRAY['global'::text, 'country'::text, 'package'::text])),
	CONSTRAINT "esim_price_rules_markup_type_check" CHECK (markup_type = ANY (ARRAY['percentage'::text, 'fixed'::text])),
	CONSTRAINT "esim_price_rules_markup_value_check" CHECK (markup_value >= (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "esim_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provisioning_order_id" uuid NOT NULL,
	"iccid" text NOT NULL,
	"esim_tran_no" text,
	"smdp_address" text,
	"activation_code_encrypted" text,
	"qr_payload_encrypted" text,
	"display_qr_asset_url" text,
	"profile_status" text NOT NULL,
	"provider_payload" jsonb,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "esim_profiles_iccid_key" UNIQUE("iccid")
);
--> statement-breakpoint
CREATE TABLE "customer_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_package_id" uuid,
	"provider_package_code" text NOT NULL,
	"package_name_snapshot" text,
	"quantity" integer NOT NULL,
	"provider_unit_cost" numeric NOT NULL,
	"markup_unit_amount" numeric NOT NULL,
	"selling_unit_price" numeric NOT NULL,
	"line_total" numeric NOT NULL,
	"package_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "customer_order_items_quantity_check" CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "esim_provider_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'esimaccess' NOT NULL,
	"package_code" text NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"location_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"volume_bytes" bigint,
	"duration_days" integer,
	"duration_unit" text,
	"data_type" integer,
	"price_provider_minor" bigint NOT NULL,
	"currency_code" text NOT NULL,
	"retail_price_provider_minor" bigint,
	"support_top_up_type" integer,
	"speed" text,
	"network" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"provider_payload" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "esim_provider_packages_provider_package_code_key" UNIQUE("provider","package_code")
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'esimaccess' NOT NULL,
	"notify_id" text NOT NULL,
	"notify_type" text NOT NULL,
	"event_fingerprint" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	CONSTRAINT "provider_webhook_events_provider_notify_id_notify_type_key" UNIQUE("provider","notify_id","notify_type"),
	CONSTRAINT "provider_webhook_events_event_fingerprint_key" UNIQUE("event_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "esim_provisioning_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text DEFAULT 'esimaccess' NOT NULL,
	"provider_transaction_id" text,
	"provider_order_no" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"request_fingerprint" text,
	"last_provider_response" jsonb,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_status" text,
	"provisioning_attempts" integer DEFAULT 0 NOT NULL,
	"last_provisioning_error" text,
	CONSTRAINT "esim_provisioning_orders_order_id_key" UNIQUE("order_id"),
	CONSTRAINT "esim_provisioning_orders_provider_transaction_id_key" UNIQUE("provider_transaction_id"),
	CONSTRAINT "esim_provisioning_orders_provider_order_no_key" UNIQUE("provider_order_no")
);
--> statement-breakpoint
CREATE TABLE "customer_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_order_code" text NOT NULL,
	"customer_id" uuid,
	"status" text NOT NULL,
	"currency_code" text DEFAULT 'IDR' NOT NULL,
	"subtotal_amount" numeric NOT NULL,
	"markup_amount" numeric NOT NULL,
	"total_amount" numeric NOT NULL,
	"payment_provider" text,
	"payment_reference" text,
	"paid_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"customer_auth_id" uuid,
	"price_snapshot" jsonb,
	"expires_at" timestamp with time zone,
	"refund_reference" text,
	"cancelled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	CONSTRAINT "customer_orders_public_order_code_key" UNIQUE("public_order_code"),
	CONSTRAINT "customer_orders_idempotency_key_key" UNIQUE("idempotency_key"),
	CONSTRAINT "customer_orders_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'ORDER_CREATED'::text, 'PAYMENT_PENDING'::text, 'PAYMENT_CONFIRMED'::text, 'PROVISIONING'::text, 'READY'::text, 'INSTALLED'::text, 'EXPIRED'::text, 'PROVISIONING_FAILED'::text, 'CANCELLED'::text, 'REFUNDED'::text]))
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"order_id" uuid,
	"status" text NOT NULL,
	"amount" numeric,
	"currency_code" text DEFAULT 'IDR' NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_fingerprint" text,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_webhook_events_provider_provider_event_id_key" UNIQUE("provider","provider_event_id"),
	CONSTRAINT "payment_webhook_events_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'FAILED'::text, 'EXPIRED'::text, 'REFUNDED'::text]))
);
--> statement-breakpoint
CREATE TABLE "esim_reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_order_no" text,
	"previous_status" text NOT NULL,
	"next_status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "esim_profiles" ADD CONSTRAINT "esim_profiles_provisioning_order_id_fkey" FOREIGN KEY ("provisioning_order_id") REFERENCES "public"."esim_provisioning_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_order_items" ADD CONSTRAINT "customer_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."customer_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_order_items" ADD CONSTRAINT "customer_order_items_provider_package_id_fkey" FOREIGN KEY ("provider_package_id") REFERENCES "public"."esim_provider_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esim_provisioning_orders" ADD CONSTRAINT "esim_provisioning_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."customer_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."customer_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esim_reconciliation_runs" ADD CONSTRAINT "esim_reconciliation_runs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."customer_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_orders_customer_auth_idx" ON "customer_orders" USING btree ("customer_auth_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "customer_orders_status_expiry_idx" ON "customer_orders" USING btree ("status" text_ops,"expires_at" text_ops);--> statement-breakpoint
CREATE INDEX "payment_webhook_events_order_idx" ON "payment_webhook_events" USING btree ("order_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "esim_reconciliation_runs_order_idx" ON "esim_reconciliation_runs" USING btree ("order_id" timestamptz_ops,"created_at" timestamptz_ops);
*/