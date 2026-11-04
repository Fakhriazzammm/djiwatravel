-- Keeps each trip's Google files tidy: the spreadsheet is verified to sit in the trip's Drive folder,
-- and the folder/spreadsheet names follow the trip name. Both self-heal on the next sync.
-- Additive and safe to rerun.
alter table travel_google_sheet_exports
  add column if not exists in_trip_folder boolean not null default false,
  add column if not exists named_as text;
