-- Additive production migration. Run only after the target Postgres/Supabase project is selected.
-- Never expose encrypted profile columns to the browser; service-role code owns provisioning.

alter table customer_orders
  add column if not exists customer_auth_id uuid;

create index if not exists customer_orders_customer_auth_idx
  on customer_orders (customer_auth_id, created_at desc);

create table if not exists payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  order_id uuid references customer_orders(id),
  status text not null check (status in ('PENDING','PAID','FAILED','EXPIRED','REFUNDED')),
  amount numeric,
  currency_code text not null default 'IDR',
  payload jsonb not null,
  signature_fingerprint text,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists payment_webhook_events_order_idx
  on payment_webhook_events (order_id, created_at desc);

-- Optional Supabase RLS: service-role writes remain allowed; customers read only own orders.
-- The policies are guarded by the auth.users foreign key check in the deployment checklist.
