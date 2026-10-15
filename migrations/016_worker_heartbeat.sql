-- Additive/idempotent Wave 5: worker liveness and dead-letter visibility.
--
-- A queue with no heartbeat cannot be trusted: "no failures" and "the worker has not run since
-- Tuesday" look identical in the database. Readiness and the admin view must be able to tell them
-- apart, so liveness is stored and not inferred from the absence of rows.
--
-- Rollback: drop the table.

create table if not exists public.worker_heartbeats (
  worker_name text primary key,
  last_heartbeat_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_safe text,
  migration_version text,
  updated_at timestamptz not null default now()
);

-- Runtime permissions, mirroring migration 009: privilege grants only, no schema or policy change.
-- DELETE is intentionally not granted; the outboxes are audit state.
grant usage on schema public to djiwatravel_app;
grant select, insert, update on public.webhook_inbox to djiwatravel_app;
grant select, insert, update on public.finance_outbox to djiwatravel_app;
grant select, insert, update on public.refund_events to djiwatravel_app;
grant select, insert, update on public.worker_heartbeats to djiwatravel_app;
grant select, insert, update on public.order_claim_events to djiwatravel_app;
