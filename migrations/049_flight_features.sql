-- Flight ticket extras: price alerts, shared fare comparisons with votes. Additive.
create table if not exists travel_flight_alerts (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  origin char(3) not null,
  destination char(3) not null,
  origin_name text not null check (char_length(origin_name) between 1 and 80),
  destination_name text not null check (char_length(destination_name) between 1 and 80),
  departure_date date not null,
  return_date date,
  flexible boolean not null default true,
  target_idr integer not null check (target_idr > 0),
  last_price_idr integer,
  last_checked_at timestamptz,
  notified_price_idr integer,
  notified_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists travel_flight_alerts_owner_idx
  on travel_flight_alerts (customer_auth_subject, active);
create index if not exists travel_flight_alerts_due_idx
  on travel_flight_alerts (active, last_checked_at);

create table if not exists travel_flight_shares (
  token text primary key check (char_length(token) between 16 and 64),
  owner_auth_subject text not null,
  offers jsonb not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  opens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists travel_flight_shares_owner_idx
  on travel_flight_shares (owner_auth_subject, created_at desc);

create table if not exists travel_flight_votes (
  token text not null references travel_flight_shares(token) on delete cascade,
  voter_auth_subject text not null,
  offer_id text not null check (char_length(offer_id) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (token, voter_auth_subject)
);
