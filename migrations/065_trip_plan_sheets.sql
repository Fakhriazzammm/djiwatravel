-- The latest "Rencana lengkap" facts per trip (fares, eSIM, budget lines, city costs) so the
-- spreadsheet and the Drive document can show them without asking the model again; plan tabs in the
-- traveler's spreadsheet; and the Drive document that mirrors the plan.
create table if not exists travel_trip_plans (
  trip_id uuid primary key references travel_trips(id) on delete cascade,
  city text not null,
  tier text not null default 'nyaman',
  -- Budget lines in whole IDR with their basis, the recorded fares / eSIM, and the city's daily costs.
  budget jsonb not null default '[]'::jsonb,
  research jsonb not null default '{}'::jsonb,
  costs jsonb not null default '{}'::jsonb,
  tips jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table travel_google_sheet_exports
  add column if not exists plan_layout smallint not null default 0;

create table if not exists travel_google_plan_docs (
  trip_id uuid primary key references travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  doc_id text not null,
  doc_url text,
  status text not null default 'ok' check (status in ('ok', 'failed')),
  last_error text,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on travel_trip_plans to djiwatravel_app;
grant select, insert, update, delete on travel_google_plan_docs to djiwatravel_app;
