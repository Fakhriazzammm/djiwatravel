-- Asisten perjalanan (obrolan AI di Ringkas). Additive and safe to rerun.

-- A proposal is something the AI suggests to change (agenda, budget, checklist, one expense).
-- The payload is stored on the server: the browser only ever sends the proposal id to apply it,
-- so a tampered request cannot write anything the AI did not propose.
create table if not exists travel_assistant_proposals (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  kind text not null check (kind in ('agenda', 'budget', 'checklist', 'expense')),
  title text not null default '',
  payload jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'undone', 'dismissed')),
  -- What apply changed (created ids and the values it replaced), so undo can put it back.
  applied jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists travel_assistant_proposals_trip_idx
  on travel_assistant_proposals (trip_id, created_at desc);

-- One conversation per trip (the trip is the thread). `chips` are the quick replies of that turn.
create table if not exists travel_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  chips jsonb,
  proposal_id uuid references travel_assistant_proposals(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists travel_assistant_messages_trip_idx
  on travel_assistant_messages (trip_id, created_at);

-- One row per model call: daily quota per traveler and the numbers Admin sees (no message text).
create table if not exists travel_assistant_runs (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  guest boolean not null default false,
  trip_id uuid references travel_trips(id) on delete set null,
  intent text not null default 'chat',
  status text not null check (status in ('ok', 'error', 'blocked')),
  model text not null,
  proposal_kind text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_idr numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists travel_assistant_runs_daily_idx
  on travel_assistant_runs (customer_auth_subject, created_at desc);
create index if not exists travel_assistant_runs_created_idx
  on travel_assistant_runs (created_at desc);

grant select, insert, update, delete on travel_assistant_proposals to djiwatravel_app;
grant select, insert, update, delete on travel_assistant_messages to djiwatravel_app;
grant select, insert, update, delete on travel_assistant_runs to djiwatravel_app;
