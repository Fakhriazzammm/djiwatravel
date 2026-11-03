-- Customer notification inbox: per-recipient archive and soft-delete (undoable). Additive, safe to rerun.
alter table public.customer_notification_states
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz;
create index if not exists customer_notification_states_recipient_idx
  on public.customer_notification_states(recipient_customer_auth_subject, deleted_at, archived_at);
