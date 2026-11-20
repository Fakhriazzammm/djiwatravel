-- 084_template_budget.sql
-- Itinerary templates carry a planned budget: a per-traveler estimate per category (in rupiah)
-- and an optional per-activity estimate. Only planned amounts: actual expenses are never copied.
-- Additive and idempotent.

BEGIN;

alter table trip_templates add column if not exists budget_json jsonb;
alter table trip_template_items add column if not exists cost_idr bigint
  check (cost_idr is null or (cost_idr >= 0 and cost_idr <= 1000000000));

COMMIT;
