-- Ide tempat di Agenda: AI suggestions built from web search. Additive and safe to rerun.

-- One cached answer per city + category (+ free-text query), shared by every traveler.
create table if not exists travel_place_idea_cache (
  cache_key text primary key,
  destination text not null,
  category text not null,
  query text not null default '',
  ideas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- One row per fresh web search (never for a cache hit): daily quota and Admin cost reporting.
create table if not exists travel_place_idea_runs (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  trip_id uuid references travel_trips(id) on delete set null,
  cache_key text not null,
  status text not null check (status in ('ok', 'empty', 'error')),
  model text not null,
  places integer not null default 0,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_idr numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists travel_place_idea_runs_daily_idx
  on travel_place_idea_runs (customer_auth_subject, created_at desc);

-- Ideas the team hid (wrong, closed or unsuitable); filtered out for every traveler.
create table if not exists travel_place_idea_hidden (
  place_key text primary key,
  name text not null,
  destination text not null default '',
  hidden_by text not null default 'admin',
  hidden_at timestamptz not null default now()
);

grant select, insert, update, delete on travel_place_idea_cache to djiwatravel_app;
grant select, insert, update, delete on travel_place_idea_runs to djiwatravel_app;
grant select, insert, update, delete on travel_place_idea_hidden to djiwatravel_app;
