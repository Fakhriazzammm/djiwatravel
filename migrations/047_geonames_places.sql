-- Offline place gazetteer for the Agenda: towns and districts from GeoNames cities500
-- (CC BY 4.0). This migration only creates the shape. Rows are loaded by
-- scripts/import-geonames.mjs, which replaces the whole dataset in one transaction, so the
-- migration is safe on an empty database and can be re-run.

create table if not exists public.geo_places (
  geoname_id bigint primary key,
  name text not null,
  ascii_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  feature_code text not null,
  country_code text not null check (char_length(country_code) = 2),
  admin1_code text,
  population bigint not null default 0
);

create index if not exists geo_places_name_prefix_idx
  on public.geo_places (lower(name) text_pattern_ops);
create index if not exists geo_places_ascii_prefix_idx
  on public.geo_places (lower(ascii_name) text_pattern_ops);
create index if not exists geo_places_latitude_idx
  on public.geo_places (latitude);

-- First-level administrative names ("JP.13" -> "Tokyo"), from GeoNames admin1CodesASCII.txt.
create table if not exists public.geo_admin1 (
  code text primary key,
  name text not null,
  ascii_name text not null
);
