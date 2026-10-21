-- Google Calendar connection and idempotent itinerary event mapping.
create table if not exists customer_google_calendar_connections (
  customer_auth_subject text primary key,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  google_account_email text,
  state_hash text,
  state_expires_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_google_calendar_state_idx on customer_google_calendar_connections (state_hash) where state_hash is not null;
create table if not exists travel_google_calendar_events (
  itinerary_item_id uuid primary key references travel_itinerary_items(id) on delete cascade,
  trip_id uuid not null references travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  calendar_id text not null default 'primary',
  event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_id, event_id)
);
create index if not exists travel_google_calendar_events_owner_idx on travel_google_calendar_events (customer_auth_subject, trip_id);
grant select, insert, update, delete on customer_google_calendar_connections, travel_google_calendar_events to djiwatravel_app;
