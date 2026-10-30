-- Read-only itinerary sharing for My Trips.
-- A bearer token is the capability; the public read model never exposes
-- expenses, checklist, documents, or booking references.
create table if not exists travel_trip_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 128),
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists travel_trip_shares_trip_idx
  on travel_trip_shares (trip_id, created_at desc);

-- Only one active link per trip keeps revocation predictable.
create unique index if not exists travel_trip_shares_active_trip_idx
  on travel_trip_shares (trip_id)
  where revoked_at is null;

grant select, insert, update, delete on travel_trip_shares to djiwatravel_app;
