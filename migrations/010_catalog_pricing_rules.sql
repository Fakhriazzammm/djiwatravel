-- Catalogue price rules: operator trail, concurrency safety, and batch rollback.
--
-- Strictly additive. The table may already exist (migrations/001) and be empty; no row is
-- rewritten, no column is dropped or renamed, and any pre-existing row keeps working with
-- version = 1 and a null operator trail.

alter table esim_price_rules add column if not exists created_by text;
alter table esim_price_rules add column if not exists reason text;
alter table esim_price_rules add column if not exists supersedes_id uuid;
alter table esim_price_rules add column if not exists version integer not null default 1;
alter table esim_price_rules add column if not exists batch_id uuid;

-- One active rule per (scope, markup kind): a scope can carry a percentage AND a nominal rule at
-- the same time, which is what "profit persen lalu tambah nominal" needs, while two competing
-- active rules for the same field stay impossible.
create unique index if not exists esim_price_rules_active_scope_uniq
  on esim_price_rules (provider, scope_type, coalesce(scope_key, '*'), markup_type)
  where active;

create index if not exists esim_price_rules_lookup_idx
  on esim_price_rules (provider, scope_type, scope_key)
  where active;

create index if not exists esim_price_rules_batch_idx
  on esim_price_rules (batch_id)
  where active;

-- Append-only history. Nothing is ever updated or deleted here: it is the only place an operator
-- can see what the price rules were before a change, and the source for batch rollback.
create table if not exists esim_price_rule_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references esim_price_rules(id),
  action text not null check (action in ('created', 'updated', 'deactivated', 'bulk_applied', 'rolled_back')),
  scope_type text not null,
  scope_key text,
  markup_type text,
  before_json jsonb,
  after_json jsonb,
  actor_id text not null,
  reason text not null,
  batch_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists esim_price_rule_events_created_idx
  on esim_price_rule_events (created_at desc);

create index if not exists esim_price_rule_events_batch_idx
  on esim_price_rule_events (batch_id);

-- Read model for the admin workspace. `esim_provider_packages` is currently empty (no provider
-- mirror sync yet), so the workspace reads packages from the canonical provider loader and uses
-- this view only once the mirror is populated. It resolves the most specific active rule per
-- package the same way the application does: package > country > global.
create or replace view admin_catalog_pricing as
select
  p.provider,
  p.package_code,
  p.slug,
  p.name,
  p.location_codes,
  p.volume_bytes,
  p.duration_days,
  p.price_provider_minor,
  p.currency_code,
  p.synced_at,
  r.scope_type as rule_scope,
  r.markup_type,
  r.markup_value,
  r.effective_from,
  r.effective_until,
  r.created_by,
  r.reason,
  now() as generated_at
from esim_provider_packages p
left join lateral (
  select x.*
  from esim_price_rules x
  where x.provider = p.provider
    and x.active
    and x.effective_from <= now()
    and (x.effective_until is null or x.effective_until > now())
    and (
      (x.scope_type = 'package' and x.scope_key = p.package_code)
      or (x.scope_type = 'country' and p.location_codes ? x.scope_key)
      or x.scope_type = 'global'
    )
  order by
    case x.scope_type when 'package' then 1 when 'country' then 2 else 3 end,
    x.effective_from desc
  limit 1
) r on true
where p.active;
