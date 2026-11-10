-- Travo "Rencana lengkap": per-city daily cost baselines (AI-made, Admin-editable), a cache of map
-- places per city, and run units so a full plan can weigh more than one message in the daily quota.

create table if not exists travel_city_costs (
  city_key text primary key,
  city_name text not null,
  country_code text not null default '',
  -- All amounts are whole IDR. Food/transport/attractions are per person per day, hotels per room per night.
  food_budget integer not null,
  food_mid integer not null,
  transport_day integer not null,
  attractions_day integer not null,
  hotel_budget integer not null,
  hotel_mid integer not null,
  source text not null default 'ai' check (source in ('ai', 'admin', 'default')),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  version integer not null default 1
);

create table if not exists travel_place_cache (
  city_key text not null,
  kind text not null,
  places jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (city_key, kind)
);

alter table travel_assistant_runs add column if not exists units integer not null default 1;
create index if not exists travel_assistant_runs_plan_idx
  on travel_assistant_runs (customer_auth_subject, intent) where intent = 'full_plan';

grant select, insert, update, delete on travel_city_costs to djiwatravel_app;
grant select, insert, update, delete on travel_place_cache to djiwatravel_app;
