-- My Trips foundation and organization entities.
-- Additive, ownership-scoped, and safe to run once on the Travel database.
create table if not exists travel_trips (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  name text not null check (char_length(name) between 1 and 120),
  destination_code text not null check (char_length(destination_code) between 2 and 8),
  destination_name text not null check (char_length(destination_name) between 1 and 120),
  departure_date date not null,
  return_date date not null,
  travelers_count integer not null default 1 check (travelers_count between 1 and 50),
  primary_currency char(3) not null default 'IDR',
  total_budget_minor bigint not null default 0 check (total_budget_minor >= 0),
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (return_date >= departure_date)
);
create index if not exists travel_trips_owner_dates_idx on travel_trips (customer_auth_subject, departure_date, return_date);

create table if not exists travel_budget_categories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category_key text,
  allocated_minor bigint not null default 0 check (allocated_minor >= 0),
  currency char(3) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, name)
);
create index if not exists travel_budget_categories_trip_idx on travel_budget_categories (trip_id, sort_order);

create table if not exists travel_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  category_id uuid references travel_budget_categories(id) on delete set null,
  description text not null check (char_length(description) between 1 and 160),
  transaction_date date not null,
  original_amount_minor bigint not null check (original_amount_minor > 0),
  original_currency char(3) not null,
  exchange_rate numeric(24,12),
  exchange_rate_source text,
  exchange_rate_status text not null default 'estimated' check (exchange_rate_status in ('estimated','confirmed','manual')),
  exchange_rate_as_of timestamptz,
  converted_amount_minor bigint not null check (converted_amount_minor > 0),
  converted_currency char(3) not null,
  payment_method text,
  notes text,
  receipt_storage_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists travel_expenses_trip_date_idx on travel_expenses (trip_id, transaction_date desc);

create table if not exists travel_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  activity_date date not null,
  start_time time,
  end_time time,
  timezone text,
  title text not null check (char_length(title) between 1 and 160),
  location text,
  notes text,
  estimated_cost_minor bigint check (estimated_cost_minor is null or estimated_cost_minor >= 0),
  currency char(3),
  booking_reference text,
  activity_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time >= start_time)
);
create index if not exists travel_itinerary_trip_date_idx on travel_itinerary_items (trip_id, activity_date, start_time);

create table if not exists travel_checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  is_completed boolean not null default false,
  due_date date,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists travel_checklist_trip_idx on travel_checklist_items (trip_id, sort_order);

create table if not exists travel_bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  category text not null,
  title text not null,
  booking_date date,
  provider text,
  reference_number text,
  notes text,
  status text not null default 'manual' check (status in ('manual','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists travel_saved_places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  name text not null,
  destination text not null,
  category text,
  notes text,
  map_url text,
  planned_visit_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists travel_documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  category text not null,
  title text not null,
  storage_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists travel_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references travel_trips(id) on delete cascade,
  member_auth_subject text not null,
  role text not null default 'viewer' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (trip_id, member_auth_subject)
);
create table if not exists travel_expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references travel_expenses(id) on delete cascade,
  member_label text not null,
  share_minor bigint not null check (share_minor >= 0),
  is_payer boolean not null default false,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists travel_trip_esims (
  trip_id uuid not null references travel_trips(id) on delete cascade,
  esim_identity text not null,
  linked_at timestamptz not null default now(),
  primary key (trip_id, esim_identity)
);
