-- Where the traveler departs from: feeds flight prices for "Rencana lengkap". Optional.
alter table travel_trips add column if not exists origin_name text;
alter table travel_trips add column if not exists origin_code text;
