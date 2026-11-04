-- Google Drive (receipt photos) and Sheets (budget export) on the existing per-user Google connection.
-- Additive and safe to rerun.
alter table customer_google_calendar_connections
  add column if not exists granted_scopes text[] not null default '{}',
  add column if not exists drive_enabled boolean not null default true;

-- Connections made before scopes were tracked only ever had Calendar.
update customer_google_calendar_connections
   set granted_scopes = array['https://www.googleapis.com/auth/calendar.events']
 where refresh_token_encrypted is not null and granted_scopes = '{}';

-- A kept receipt photo that moved to the traveler's Drive keeps its row (it marks "has a receipt")
-- but drops the bytes.
alter table public.travel_receipt_photos alter column bytes drop not null;

create table if not exists travel_google_drive_files (
  receipt_scan_id uuid primary key references public.travel_receipt_scans(id) on delete cascade,
  trip_id uuid not null references travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  drive_file_id text,
  drive_folder_id text,
  status text not null check (status in ('pending','uploading','uploaded','failed','revoked')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists travel_google_drive_files_owner_idx on travel_google_drive_files (customer_auth_subject, status);
create index if not exists travel_google_drive_files_status_idx on travel_google_drive_files (status, updated_at);

create table if not exists travel_google_sheet_exports (
  trip_id uuid primary key references travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  spreadsheet_id text,
  spreadsheet_url text,
  status text not null check (status in ('pending','syncing','synced','failed','revoked')),
  last_synced_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists travel_google_sheet_exports_owner_idx on travel_google_sheet_exports (customer_auth_subject, status);

-- Per-trip Drive folder, so every receipt of a trip lands in one place.
create table if not exists travel_google_drive_folders (
  trip_id uuid primary key references travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  root_folder_id text not null,
  trip_folder_id text not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on travel_google_drive_files, travel_google_sheet_exports, travel_google_drive_folders to djiwatravel_app;
