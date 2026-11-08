-- Additive discovery requests; existing shopping orders/payment flow remains compatible.
set lock_timeout = '5s';
-- PostgreSQL 16; zero existing shopping orders at preflight. Old app ignores this additive field.
alter table shopping_orders add column if not exists domestic_shipping_idr integer not null default 0 check(domestic_shipping_idr >= 0);
create table if not exists shopping_discovery_requests (
 id uuid primary key default gen_random_uuid(),
 customer_auth_subject text not null,
 client_key uuid not null,
 source_url text,
 note text not null default '',
 analysis text,
 analysis_error text,
 status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','SEARCHING','NEEDS_INFO','OFFERED','DECLINED','UNAVAILABLE','ORDERED','CANCELLED')),
 version integer not null default 1,
 photo_mime text,
 photo_bytes bytea,
 photo_expires_at timestamptz,
 ai_reserved integer not null default 0,
 offer jsonb,
 offer_expires_at timestamptz,
 order_id uuid unique references shopping_orders(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(customer_auth_subject,client_key),
 check(photo_bytes is null or octet_length(photo_bytes) <= 5242880)
);
create index if not exists shopping_discovery_owner_idx on shopping_discovery_requests(customer_auth_subject,created_at desc);
create index if not exists shopping_discovery_status_idx on shopping_discovery_requests(status,created_at desc);
create table if not exists shopping_discovery_events (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references shopping_discovery_requests(id),
 actor text not null,
 version integer not null default 1,
 offer jsonb,
 status text not null,
 note text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists shopping_discovery_event_idx on shopping_discovery_events(request_id,created_at);
grant select, insert, update on shopping_discovery_requests, shopping_discovery_events to djiwatravel_app;

create index if not exists shopping_discovery_created_idx on shopping_discovery_requests(created_at);
create index if not exists shopping_discovery_photo_expiry_idx on shopping_discovery_requests(photo_expires_at) where photo_bytes is not null;
