-- Two-way sync between the app and the traveler's spreadsheet.
-- travel_google_sheet_rows is the fingerprint of every row as it was last written to the sheet; it is
-- how a change made in the sheet is told apart from one made in the app (or both). Additive and
-- safe to rerun.
create table if not exists travel_google_sheet_rows (
  trip_id uuid not null references travel_trips(id) on delete cascade,
  tab text not null,
  row_key text not null,
  hash text not null,
  primary key (trip_id, tab, row_key)
);

alter table travel_google_sheet_exports
  add column if not exists layout_version smallint not null default 1,
  add column if not exists formatted boolean not null default false,
  add column if not exists last_report jsonb,
  add column if not exists pulled_rows_total integer not null default 0,
  add column if not exists conflicts_total integer not null default 0;

grant select, insert, update, delete on travel_google_sheet_rows to djiwatravel_app;
