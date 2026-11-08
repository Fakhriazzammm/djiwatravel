-- Titip Belanja: marketplace listings (Mercari, Rakuten) priced from the item page, and the
-- order-line fields that point at them. Additive; catalog orders are unchanged.
set lock_timeout = '5s';

create table if not exists shopping_market_items (
  id uuid primary key default gen_random_uuid(),
  site text not null check (site in ('mercari','rakuten')),
  external_id text not null check (char_length(external_id) between 3 and 140),
  source_url text not null,
  name text not null check (char_length(name) between 2 and 300),
  price_jpy integer not null check (price_jpy > 0),
  image_url text,
  condition_text text check (condition_text is null or char_length(condition_text) <= 120),
  size_text text check (size_text is null or char_length(size_text) <= 40),
  sold boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (site, external_id)
);

create table if not exists shopping_market_lookups (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  site text not null,
  created_at timestamptz not null default now()
);
create index if not exists shopping_market_lookups_owner_idx
  on shopping_market_lookups (customer_auth_subject, created_at desc);

alter table shopping_order_items add column if not exists market_item_id uuid
  references shopping_market_items(id) on delete set null;
alter table shopping_order_items add column if not exists variant text
  check (variant is null or char_length(variant) <= 200);

grant select, insert, update on shopping_market_items, shopping_market_lookups to djiwatravel_app;
