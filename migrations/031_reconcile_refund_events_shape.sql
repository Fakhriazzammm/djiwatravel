-- Reconcile public.refund_events with the shape used by the app (migration 015 / drizzle schema):
--   order_id, status, actor_subject, reason, note_safe, idempotency_key, provider, provider_refund_reference.
-- Migration 012 created a different, legacy refund_events (refund_request_id, event_key, event_type, payload)
-- with "create table if not exists". On a host where that legacy table exists, 015's order_id index fails.
--
-- This migration is additive and idempotent:
--   * If the legacy shape is detected (no order_id column), the legacy table is renamed and kept for audit.
--     Its rows are never copied or deleted here.
--   * The app shape is then created if missing, with the same grant that 024 gave the app role.
--   * If the table already has the app shape, nothing destructive happens.
-- Host verification (scripts/apply-migrations.sh --status, then \d public.refund_events) is still required
-- before refund decisions are considered safe to enable. Provider execution stays out of scope here.

do $$
begin
  if exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'refund_events')
     and not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'refund_events' and column_name = 'order_id')
  then
    alter table public.refund_events rename to refund_events_legacy_012;
  end if;
end $$;

create table if not exists public.refund_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  status text not null
    check (status in ('REQUESTED','APPROVED','REJECTED','PROVIDER_PENDING','PROVIDER_REFUNDED','FINANCE_REVERSED','FAILED')),
  amount numeric,
  currency_code text not null default 'IDR',
  actor_subject text not null,
  reason text,
  note_safe text,
  idempotency_key text not null,
  provider text,
  provider_refund_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists refund_events_order_idx
  on public.refund_events (order_id, created_at desc);

grant select, insert, update on table public.refund_events to djiwatravel_app;
