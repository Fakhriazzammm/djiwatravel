-- Additive/idempotent Wave 5: finance posting outbox.
--
-- Problem: the finance hand-off was best-effort inside settlement. When Djiwa Finance was
-- unreachable the order still settled (correct — the money did arrive), but the accounting
-- obligation disappeared with the log line and nobody could retry it. A settled order with an
-- unposted ledger entry is an outbox row, not a silent gap.
--
-- Idempotency: one row per (order_id, purpose) and one provider-side key, so a retry after a
-- timeout that actually succeeded cannot double-post.
--
-- Rollback: drop the table; the settled orders themselves are untouched.

create table if not exists public.finance_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  purpose text not null default 'SETTLEMENT'
    check (purpose in ('SETTLEMENT','REFUND','REVERSAL')),
  idempotency_key text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','POSTING','POSTED','FAILED','DEAD_LETTER')),
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  locked_until timestamptz,
  lease_owner text,
  amount numeric,
  currency_code text not null default 'IDR',
  payload jsonb not null,
  last_error_safe text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One accounting obligation per order per purpose.
  unique (order_id, purpose),
  -- One provider-side posting per key, even across concurrent workers.
  unique (idempotency_key)
);

create index if not exists finance_outbox_due_idx
  on public.finance_outbox (status, next_retry_at, created_at);

create index if not exists finance_outbox_review_idx
  on public.finance_outbox (status, updated_at desc)
  where status in ('FAILED','DEAD_LETTER');
