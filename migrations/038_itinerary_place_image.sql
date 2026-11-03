-- Agenda map: optional place thumbnail resolved server-side (Wikipedia/Wikimedia), cached on the item.
-- place_image_checked_at marks "looked up" so a place with no photo is not searched again on every view.
alter table public.travel_itinerary_items
  add column if not exists place_image_url text check (place_image_url is null or char_length(place_image_url) <= 500),
  add column if not exists place_image_checked_at timestamptz;
