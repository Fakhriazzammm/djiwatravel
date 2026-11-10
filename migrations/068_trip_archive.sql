-- A traveler can archive a trip from My Trips (swipe action); archived trips are hidden from the
-- active lists, the Home widget, agenda and reminders, and can be restored.
alter table travel_trips add column if not exists archived_at timestamptz;
