-- Additive/idempotent Wave 3: durable inbox for payment/provider events.
--
-- Problem: the callback handler did its bookkeeping inline. A process restart between "receipt
-- accepted" and "database writes finished" lost the event entirely, and a duplicate delivery was
-- only suppressed by a unique key on an already-written row.
--
-- This is a queue, not a second source of truth: the order row remains authoritative and the venue
-- is idempotent on (provider, provider_event_id), so re-receipt of the same event can never settle
-- an order twice.
--
-- Rollback: drop the table (it holds only transport state, never financial history).

create table if not exists public.webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload_hash text not null,
  payload jsonb not null,
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED','PROCESSING','PROCESSED','FAILED','DEAD_LETTER')),
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  locked_until timestamptz,
  lease_owner text,
  last_error_safe text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  -- Re-delivery of the same event is a no-op, not a second settlement.
  unique (provider, event_id)
);

-- Claim query: due, unleased, still-unprocessed work, oldest first.
create index if not exists webhook_inbox_due_idx
  on public.webhook_inbox (status, next_retry_at, received_at);

create index if not exists webhook_inbox_lease_idx
  on public.webhook_inbox (status, locked_until);

create index if not exists webhook_inbox_dead_letter_idx
  on public.webhook_inbox (status, updated_at desc)
  where status in ('FAILED','DEAD_LETTER');
