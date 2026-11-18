-- Kirim Barang (international shipping, Japan first): a customer books a parcel, drops it at the
-- Tasikmalaya drop point, the team weighs it and bills it (own Mayar invoice), then ships it with a
-- partner courier. Additive; independent from customer_orders and shopping_orders on purpose.

create sequence if not exists shipping_code_seq;

create table if not exists shipping_orders (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  customer_auth_subject text not null,
  country char(2) not null default 'JP',
  -- Tariff frozen at booking, so a later Admin change never reprices a booked parcel.
  rate_idr_per_kg integer not null check (rate_idr_per_kg > 0),
  partner_idr_per_kg integer not null default 0 check (partner_idr_per_kg >= 0),
  min_kg numeric(5,2) not null default 1 check (min_kg > 0),
  round_kg numeric(5,2) not null default 0.5 check (round_kg > 0),
  recipient_name text not null check (char_length(recipient_name) between 2 and 120),
  recipient_phone text not null check (char_length(recipient_phone) between 8 and 20),
  postal_code text not null check (char_length(postal_code) between 7 and 8),
  prefecture text not null check (char_length(prefecture) between 2 and 40),
  city text not null check (char_length(city) between 2 and 100),
  address_line text not null check (char_length(address_line) between 5 and 300),
  category text not null check (char_length(category) between 2 and 40),
  contents text not null check (char_length(contents) between 3 and 300),
  declared_value_idr integer not null default 0 check (declared_value_idr >= 0),
  estimated_kg numeric(6,2) not null check (estimated_kg > 0),
  inbound_mode text not null default 'SELF' check (inbound_mode in ('SELF','COURIER')),
  inbound_courier text check (inbound_courier is null or char_length(inbound_courier) <= 60),
  inbound_tracking text check (inbound_tracking is null or char_length(inbound_tracking) <= 80),
  drop_deadline_at timestamptz not null,
  reminded_at timestamptz,
  status text not null default 'AWAITING_DROP' check (status in (
    'AWAITING_DROP','RECEIVED','PAYMENT_PENDING','PAID','SHIPPED','ARRIVED','DELIVERED',
    'CANCELLED','REJECTED','EXPIRED')),
  weighed_kg numeric(6,2) check (weighed_kg is null or weighed_kg > 0),
  billed_kg numeric(6,2) check (billed_kg is null or billed_kg > 0),
  freight_idr integer check (freight_idr is null or freight_idr >= 0),
  packing_idr integer not null default 0 check (packing_idr >= 0),
  total_idr integer check (total_idr is null or total_idr > 0),
  partner_cost_idr integer check (partner_cost_idr is null or partner_cost_idr >= 0),
  weigh_note text check (weigh_note is null or char_length(weigh_note) <= 400),
  weighed_at timestamptz,
  payment_state text not null default 'NONE' check (payment_state in (
    'NONE','REQUESTING','CONFIRMED','FAILED','UNKNOWN')),
  invoice_id text,
  transaction_id text,
  payment_url text,
  payment_expires_at timestamptz,
  paid_at timestamptz,
  finance_error text,
  courier text check (courier is null or char_length(courier) <= 60),
  tracking_number text check (tracking_number is null or char_length(tracking_number) <= 80),
  shipped_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  status_reason text check (status_reason is null or char_length(status_reason) <= 400),
  admin_note text check (admin_note is null or char_length(admin_note) <= 800),
  refund_needed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipping_orders_owner_idx
  on shipping_orders (customer_auth_subject, created_at desc);
create index if not exists shipping_orders_status_idx on shipping_orders (status, created_at desc);

create table if not exists shipping_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references shipping_orders(id) on delete cascade,
  status text not null,
  actor text not null default 'system',
  note text check (note is null or char_length(note) <= 800),
  created_at timestamptz not null default now()
);
create index if not exists shipping_order_events_order_idx
  on shipping_order_events (order_id, created_at);

-- Weigh-in photos (scale and parcel contents), bytes in the database like Feeds photos.
create table if not exists shipping_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references shipping_orders(id) on delete cascade,
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
  bytes bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists shipping_photos_order_idx on shipping_photos (order_id, created_at);

-- The waitlist feature key follows the tile: Bagasi became Kirim Barang ("shipping"). 'bagasi' stays
-- allowed so an app instance running the previous build can still write while a deploy rolls out.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.travel_waitlist_entries'::regclass
       and contype = 'c' and pg_get_constraintdef(oid) ilike '%feature_key%'
  loop
    execute format('alter table public.travel_waitlist_entries drop constraint %I', c.conname);
  end loop;
end $$;
update public.travel_waitlist_entries set feature_key = 'shipping' where feature_key = 'bagasi';
alter table public.travel_waitlist_entries
  add constraint travel_waitlist_feature_key_check
  check (feature_key in ('bagasi','shipping','shopper'));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'djiwatravel_app') then
    grant select, insert, update, delete on shipping_orders, shipping_order_events, shipping_photos
      to djiwatravel_app;
    grant usage, select on sequence shipping_code_seq to djiwatravel_app;
  end if;
end $$;
