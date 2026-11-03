-- Agenda map: optional coordinates per itinerary item so the trip Agenda can draw pins and a day route.
-- Additive and safe to rerun. Existing rows keep working with only the free-text location.
alter table public.travel_itinerary_items
  add column if not exists latitude double precision check (latitude is null or latitude between -90 and 90),
  add column if not exists longitude double precision check (longitude is null or longitude between -180 and 180),
  add column if not exists place_label text check (place_label is null or char_length(place_label) <= 200);

create index if not exists travel_itinerary_geo_idx
  on public.travel_itinerary_items (trip_id, activity_date)
  where latitude is not null and longitude is not null;
