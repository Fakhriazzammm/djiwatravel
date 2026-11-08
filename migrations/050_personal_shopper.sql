-- Titip Belanja (personal shopper): cached store catalog, member orders with their own Mayar invoice,
-- and an append-only timeline. Additive; independent from customer_orders (eSIM) on purpose.

create table if not exists shopping_catalog_items (
  id uuid primary key default gen_random_uuid(),
  country char(2) not null,
  brand text not null check (brand in ('uniqlo','gu','donki','muji')),
  product_code text not null check (char_length(product_code) between 1 and 60),
  name text not null check (char_length(name) between 1 and 300),
  name_id text check (name_id is null or char_length(name_id) between 1 and 300),
  category text not null check (category in ('Atasan','Bawahan','Jaket','Inner','Lainnya')),
  price_minor integer not null check (price_minor > 0),
  original_minor integer check (original_minor is null or original_minor > 0),
  currency char(3) not null default 'JPY',
  image_url text,
  product_url text not null,
  rating numeric(3,2),
  rating_count integer not null default 0,
  trend_score integer not null default 0 check (trend_score between 0 and 100),
  is_new boolean not null default false,
  sizes jsonb not null default '[]'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  hidden boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (brand, product_code)
);
create index if not exists shopping_catalog_country_idx
  on shopping_catalog_items (country, brand, hidden);

create table if not exists shopping_catalog_runs (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_seen integer not null default 0,
  items_saved integer not null default 0,
  error text,
  trigger text not null default 'schedule'
);
create index if not exists shopping_catalog_runs_idx on shopping_catalog_runs (brand, started_at desc);

create table if not exists shopping_orders (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  customer_auth_subject text not null,
  country char(2) not null,
  currency char(3) not null,
  rate_idr numeric(12,4) not null check (rate_idr > 0),
  subtotal_idr integer not null check (subtotal_idr >= 0),
  fee_idr integer not null check (fee_idr >= 0),
  shipping_idr integer not null check (shipping_idr >= 0),
  total_idr integer not null check (total_idr > 0),
  status text not null default 'PAYMENT_PENDING' check (status in (
    'PAYMENT_PENDING','PAID','PURCHASED','SHIPPED','ARRIVED','DELIVERED','CANCELLED','EXPIRED')),
  payment_state text not null default 'NONE' check (payment_state in (
    'NONE','REQUESTING','CONFIRMED','FAILED','UNKNOWN')),
  invoice_id text,
  transaction_id text,
  payment_url text,
  payment_expires_at timestamptz not null,
  paid_at timestamptz,
  finance_error text,
  recipient_name text not null check (char_length(recipient_name) between 1 and 120),
  recipient_whatsapp text not null check (char_length(recipient_whatsapp) between 8 and 20),
  address_line text not null check (char_length(address_line) between 5 and 400),
  city text not null check (char_length(city) between 2 and 100),
  postal_code text not null check (char_length(postal_code) between 3 and 10),
  customer_note text check (customer_note is null or char_length(customer_note) <= 400),
  courier text,
  tracking_number text,
  admin_note text check (admin_note is null or char_length(admin_note) <= 800),
  refund_needed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shopping_orders_owner_idx
  on shopping_orders (customer_auth_subject, created_at desc);
create index if not exists shopping_orders_status_idx on shopping_orders (status, created_at desc);

create table if not exists shopping_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references shopping_orders(id) on delete cascade,
  catalog_item_id uuid references shopping_catalog_items(id) on delete set null,
  brand text not null,
  product_code text not null,
  name text not null,
  size text not null check (char_length(size) between 1 and 20),
  color text check (color is null or char_length(color) <= 40),
  quantity integer not null check (quantity between 1 and 20),
  unit_minor integer not null check (unit_minor > 0),
  unit_idr integer not null check (unit_idr > 0),
  image_url text,
  product_url text not null
);
create index if not exists shopping_order_items_order_idx on shopping_order_items (order_id);
create index if not exists shopping_order_items_product_idx on shopping_order_items (brand, product_code);

create table if not exists shopping_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references shopping_orders(id) on delete cascade,
  status text not null,
  actor text not null default 'system',
  note text check (note is null or char_length(note) <= 800),
  created_at timestamptz not null default now()
);
create index if not exists shopping_order_events_order_idx
  on shopping_order_events (order_id, created_at);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'djiwatravel_app') then
    grant select, insert, update, delete on shopping_catalog_items, shopping_catalog_runs,
      shopping_orders, shopping_order_items, shopping_order_events to djiwatravel_app;
  end if;
end $$;
