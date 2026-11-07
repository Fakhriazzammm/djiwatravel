-- Cities a traveler plans to visit on a trip. They frame the Ringkas/Agenda maps and scope place
-- search in "Tambah aktivitas". Additive and optional: trips without cities keep working.
create table if not exists travel_trip_cities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (trip_id, name)
);
create index if not exists travel_trip_cities_trip_idx on travel_trip_cities (trip_id, sort_order);
