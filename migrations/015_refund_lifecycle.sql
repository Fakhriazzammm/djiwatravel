-- Additive/idempotent Wave 5: auditable, idempotent refund lifecycle.
--
-- Scope note: the Mayar refund/status contract is NOT verified for this deployment, so nothing here
-- calls a provider refund endpoint. This migration only makes the workflow and its audit trail
-- durable, so a refund is a reviewable record instead of a status flip. The provider adapter stays
-- unimplemented until the contract is proven.
--
-- A refund is never asserted by a status column alone: the decision, the actor, and the provider
-- reference are separate rows and the order is only marked REFUNDED after the provider reference
-- exists. Those columns already exist on customer_orders (refund_reference, refunded_at,
-- cancelled_at); no order column is added, renamed, or dropped here.
--
-- Rollback: drop the table.

create table if not exists public.refund_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  status text not null
    check (status in ('REQUESTED','APPROVED','REJECTED','PROVIDER_PENDING','PROVIDER_REFUNDED','FINANCE_REVERSED','FAILED')),
  amount numeric,
  currency_code text not null default 'IDR',
  -- Admin authorization is recorded as an actor identity resolved server-side.
  actor_subject text not null,
  reason text,
  -- Operator-facing, bounded; never a raw provider payload.
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
