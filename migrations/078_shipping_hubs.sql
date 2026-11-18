-- Kirim Barang: the route Tasikmalaya (drop point) -> Bandung (warehouse) -> Jakarta -> Japan, moved in
-- batches and checked in by scan at every hub, with field staff accounts. Additive.

create sequence if not exists shipping_batch_seq;

-- Field staff ("petugas"): a Google account the team registered, limited to the hubs it works at.
create table if not exists shipping_staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 5 and 254),
  name text not null check (char_length(name) between 2 and 80),
  hubs text[] not null check (cardinality(hubs) between 1 and 3 and hubs <@ array['TASIK','BANDUNG','JAKARTA']),
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

-- One trip between two points: loaded by scan, departed with one tap, checked in at the other end.
create table if not exists shipping_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  from_hub text not null check (from_hub in ('TASIK','BANDUNG','JAKARTA')),
  to_hub text not null check (to_hub in ('BANDUNG','JAKARTA','JAPAN')),
  status text not null default 'OPEN' check (status in ('OPEN','DEPARTED','ARRIVED','CANCELLED')),
  carrier text not null check (char_length(carrier) between 2 and 60),
  tracking text check (tracking is null or char_length(tracking) <= 80),
  partner_kg numeric(7,2) check (partner_kg is null or partner_kg > 0),
  note text check (note is null or char_length(note) <= 400),
  created_by text not null,
  departed_at timestamptz,
  arrived_at timestamptz,
  created_at timestamptz not null default now(),
  check ((from_hub = 'TASIK' and to_hub = 'BANDUNG') or (from_hub = 'BANDUNG' and to_hub = 'JAKARTA')
      or (from_hub = 'JAKARTA' and to_hub = 'JAPAN'))
);
create index if not exists shipping_batches_status_idx on shipping_batches (status, from_hub, created_at desc);

alter table shipping_orders drop constraint if exists shipping_orders_status_check;
alter table shipping_orders add constraint shipping_orders_status_check check (status in (
  'AWAITING_DROP','RECEIVED','PAYMENT_PENDING','PAID','TO_BANDUNG','AT_BANDUNG','TO_JAKARTA','AT_JAKARTA',
  'SHIPPED','ARRIVED','DELIVERED','CANCELLED','REJECTED','EXPIRED','PROBLEM'));

alter table shipping_orders
  add column if not exists current_hub text check (current_hub is null or current_hub in ('TASIK','BANDUNG','JAKARTA')),
  add column if not exists batch_id uuid references shipping_batches(id) on delete set null,
  add column if not exists batch_checked_at timestamptz,
  add column if not exists problem_from text,
  add column if not exists problem_note text check (problem_note is null or char_length(problem_note) <= 400);
create index if not exists shipping_orders_batch_idx on shipping_orders (batch_id);

alter table shipping_order_events
  add column if not exists hub text,
  add column if not exists batch_code text;
alter table shipping_photos add column if not exists hub text;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'djiwatravel_app') then
    grant select, insert, update, delete on shipping_staff, shipping_batches to djiwatravel_app;
    grant usage, select on sequence shipping_batch_seq to djiwatravel_app;
  end if;
end $$;
