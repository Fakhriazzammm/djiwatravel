-- Trip templates: a published, day-based snapshot of an itinerary that other travelers can copy.
-- The snapshot never carries notes, costs, bookings or documents. Additive and safe to rerun.

BEGIN;

create table if not exists trip_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{6,80}$'),
  owner_subject text not null,
  owner_name text,
  title text not null check (char_length(title) between 3 and 120),
  description text check (description is null or char_length(description) <= 600),
  destination_code text not null check (char_length(destination_code) between 2 and 8),
  destination_name text not null check (char_length(destination_name) between 1 and 120),
  day_count integer not null check (day_count between 1 and 30),
  cover_url text check (cover_url is null or char_length(cover_url) <= 500),
  status text not null default 'published' check (status in ('published','unpublished','hidden')),
  featured boolean not null default false,
  source text not null default 'trip' check (source in ('trip','travo')),
  source_trip_id uuid references travel_trips(id) on delete set null,
  version integer not null default 1,
  view_count integer not null default 0,
  use_count integer not null default 0,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists trip_templates_owner_idx on trip_templates (owner_subject, created_at desc);
create index if not exists trip_templates_gallery_idx
  on trip_templates (featured desc, use_count desc, published_at desc) where status = 'published';
create index if not exists trip_templates_country_idx
  on trip_templates (destination_code) where status = 'published';

create table if not exists trip_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references trip_templates(id) on delete cascade,
  day_index integer not null check (day_index between 1 and 30),
  sort_order integer not null default 0,
  start_time time,
  end_time time,
  title text not null check (char_length(title) between 1 and 160),
  location text check (location is null or char_length(location) <= 200),
  category text check (category is null or char_length(category) <= 40),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  place_image_url text check (place_image_url is null or char_length(place_image_url) <= 500)
);
create index if not exists trip_template_items_idx on trip_template_items (template_id, day_index, sort_order);

create table if not exists trip_template_uses (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references trip_templates(id) on delete cascade,
  template_version integer not null,
  user_subject text not null,
  trip_id uuid references travel_trips(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists trip_template_uses_template_idx on trip_template_uses (template_id, created_at desc);

create table if not exists trip_template_reports (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references trip_templates(id) on delete cascade,
  reporter_subject text,
  reason text not null check (char_length(reason) between 3 and 300),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists trip_template_reports_open_idx on trip_template_reports (created_at desc) where handled_at is null;

alter table travel_trips add column if not exists source_template_id uuid references trip_templates(id) on delete set null;

grant select, insert, update, delete on
  trip_templates, trip_template_items, trip_template_uses, trip_template_reports
  to djiwatravel_app;

COMMIT;
