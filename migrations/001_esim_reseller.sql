-- Additive Postgres/Supabase foundation. Run only after selecting the production DB.
create extension if not exists pgcrypto;

create table if not exists esim_provider_packages (
  id uuid primary key default gen_random_uuid(), provider text not null default 'esimaccess',
  package_code text not null, slug text, name text not null, location_codes jsonb not null default '[]',
  volume_bytes bigint, duration_days integer, duration_unit text, data_type integer,
  price_provider_minor bigint not null, currency_code text not null, retail_price_provider_minor bigint,
  support_top_up_type integer, speed text, network jsonb, active boolean not null default true,
  provider_payload jsonb, synced_at timestamptz not null default now(),
  unique (provider, package_code)
);
create table if not exists esim_price_rules (
  id uuid primary key default gen_random_uuid(), provider text not null default 'esimaccess',
  scope_type text not null check (scope_type in ('global','country','package')), scope_key text,
  markup_type text not null check (markup_type in ('percentage','fixed')), markup_value numeric not null check (markup_value >= 0),
  currency_code text not null default 'IDR', active boolean not null default true,
  effective_from timestamptz not null default now(), effective_until timestamptz, created_at timestamptz not null default now()
);
create table if not exists customer_orders (
  id uuid primary key default gen_random_uuid(), public_order_code text unique not null,
  customer_id uuid, status text not null check (status in ('DRAFT','PAYMENT_PENDING','PAYMENT_CONFIRMED','PROVISIONING','READY','PROVISIONING_FAILED','CANCELLED','REFUNDED')),
  currency_code text not null default 'IDR', subtotal_amount numeric not null, markup_amount numeric not null, total_amount numeric not null,
  payment_provider text, payment_reference text, paid_at timestamptz, idempotency_key text unique not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists customer_order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references customer_orders(id),
  provider_package_id uuid references esim_provider_packages(id), provider_package_code text not null,
  package_name_snapshot text, quantity integer not null check (quantity > 0), provider_unit_cost numeric not null,
  markup_unit_amount numeric not null, selling_unit_price numeric not null, line_total numeric not null, package_snapshot jsonb not null default '{}'
);
create table if not exists esim_provisioning_orders (
  id uuid primary key default gen_random_uuid(), order_id uuid unique not null references customer_orders(id), provider text not null default 'esimaccess',
  provider_transaction_id text unique, provider_order_no text unique, status text not null default 'PENDING', request_fingerprint text,
  last_provider_response jsonb, attempt_count integer not null default 0, next_retry_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists esim_profiles (
  id uuid primary key default gen_random_uuid(), provisioning_order_id uuid not null references esim_provisioning_orders(id),
  iccid text unique not null, esim_tran_no text, smdp_address text, activation_code_encrypted text, qr_payload_encrypted text,
  display_qr_asset_url text, profile_status text not null, provider_payload jsonb, activated_at timestamptz, expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists provider_webhook_events (
  id uuid primary key default gen_random_uuid(), provider text not null default 'esimaccess', notify_id text not null,
  notify_type text not null, event_fingerprint text unique not null, payload jsonb not null, processed_at timestamptz, processing_error text,
  unique (provider, notify_id, notify_type)
);
