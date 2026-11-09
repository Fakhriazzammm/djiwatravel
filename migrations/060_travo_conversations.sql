-- Travo conversations: one shared history for the trip chat (my-trips/<id>) and the standalone /travo page.
-- A trip conversation keeps its trip_id (one per trip); general conversations have none. Additive and safe to rerun.

create table if not exists travel_assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  trip_id uuid references travel_trips(id) on delete cascade,
  title text not null default '',
  scope text not null default 'all' check (scope in ('all', 'trip', 'esim', 'tiket', 'titip', 'panduan')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists travel_assistant_conversations_trip_uidx
  on travel_assistant_conversations (customer_auth_subject, trip_id) where trip_id is not null;
create index if not exists travel_assistant_conversations_owner_idx
  on travel_assistant_conversations (customer_auth_subject, last_message_at desc);

alter table travel_assistant_messages add column if not exists conversation_id uuid
  references travel_assistant_conversations(id) on delete cascade;
alter table travel_assistant_messages alter column trip_id drop not null;
alter table travel_assistant_runs add column if not exists conversation_id uuid
  references travel_assistant_conversations(id) on delete set null;
alter table travel_assistant_runs add column if not exists scope text;

-- Backfill: every trip that already has messages becomes a trip conversation, and its messages join it.
insert into travel_assistant_conversations (customer_auth_subject, trip_id, title, scope, last_message_at, created_at)
select m.customer_auth_subject, m.trip_id, coalesce(t.name, ''), 'trip', max(m.created_at), min(m.created_at)
from travel_assistant_messages m
left join travel_trips t on t.id = m.trip_id
where m.trip_id is not null and m.conversation_id is null
group by m.customer_auth_subject, m.trip_id, t.name
on conflict do nothing;

update travel_assistant_messages m
set conversation_id = c.id
from travel_assistant_conversations c
where m.conversation_id is null
  and c.trip_id = m.trip_id and c.customer_auth_subject = m.customer_auth_subject;

create index if not exists travel_assistant_messages_conv_idx
  on travel_assistant_messages (conversation_id, created_at);

grant select, insert, update, delete on travel_assistant_conversations to djiwatravel_app;
