-- Additive/idempotent Wave 1: canonical member ownership of a travel order.
--
-- Why a new column instead of reusing `customer_auth_id`:
-- `customer_auth_id` was declared `uuid` (migration 002), but Better Auth issues an opaque text
-- subject (observed: 32 alphanumeric characters) and `requireBetterAuthUser` validates that shape.
-- Writing a real session subject into a uuid column fails at the cast, so no order could ever have
-- been bound to a member. The old column is left in place untouched (no drop, no rename) so any
-- historical value stays readable; new code reads and writes `customer_auth_subject` only.
--
-- Rollback: drop the index and the two columns added here; no historical column is modified.

alter table public.customer_orders
  add column if not exists customer_auth_subject text;

alter table public.customer_orders
  add column if not exists customer_auth_linked_at timestamptz;

create index if not exists customer_orders_customer_auth_subject_idx
  on public.customer_orders (customer_auth_subject, created_at desc);

-- Ownership is only ever established by a verified session or a verified guest claim, so a row with
-- no subject simply stays guest-only and is never returned by the member read path.
comment on column public.customer_orders.customer_auth_subject is
  'Verified Better Auth subject that owns this order. NULL means guest-only. Never written from browser input.';

-- Claim audit: one guest order may be claimed once, by one subject, and the attempt is recorded.
create table if not exists public.order_claim_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  customer_auth_subject text not null,
  outcome text not null check (outcome in ('CLAIMED','ALREADY_MEMBER','OWNED_BY_OTHER','UNVERIFIED')),
  -- Hash of the presented token, never the token itself.
  presented_token_hash text,
  created_at timestamptz not null default now()
);

create index if not exists order_claim_events_order_idx
  on public.order_claim_events (order_id, created_at desc);

-- A given order is claimed at most once; repeated attempts are recorded as ALREADY_MEMBER instead.
create unique index if not exists order_claim_events_claimed_once_idx
  on public.order_claim_events (order_id)
  where outcome = 'CLAIMED';
