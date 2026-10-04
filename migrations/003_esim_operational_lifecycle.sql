-- Additive eSIM operational lifecycle migration. Run after 001/002 in production.
alter table if exists customer_orders
  drop constraint if exists customer_orders_status_check;
alter table if exists customer_orders
  add constraint customer_orders_status_check check (status in ('DRAFT','ORDER_CREATED','PAYMENT_PENDING','PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED','EXPIRED','PROVISIONING_FAILED','CANCELLED','REFUNDED'));
alter table if exists customer_orders
  add column if not exists price_snapshot jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists refund_reference text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists refunded_at timestamptz;
alter table if exists esim_provisioning_orders
  add column if not exists provider_status text,
  add column if not exists provisioning_attempts integer not null default 0,
  add column if not exists last_provisioning_error text;
create index if not exists customer_orders_status_expiry_idx on customer_orders(status, expires_at);

create table if not exists esim_reconciliation_runs (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references customer_orders(id),
  provider_order_no text, previous_status text not null, next_status text not null,
  attempts integer not null default 1, error_message text, created_at timestamptz not null default now()
);
create index if not exists esim_reconciliation_runs_order_idx on esim_reconciliation_runs(order_id, created_at desc);
