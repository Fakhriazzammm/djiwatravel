-- Calendar events now carry two explicit reminders instead of the calendar's default (which is often
-- empty). Events synced before that keep reminder_version 0 and are re-sent by the next sync.
-- Additive and safe to rerun.
alter table travel_google_calendar_events
  add column if not exists reminder_version smallint not null default 0;
