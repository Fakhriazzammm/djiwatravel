-- Titip Belanja chat: one thread per search request (or per order), messages, and photo attachments.
-- Additive. Requests, offers and orders keep their own tables; the thread only carries the talk.
set lock_timeout = '5s';
create table if not exists shopping_chat_threads (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  customer_name text not null default '',
  kind text not null check (kind in ('REQUEST','ORDER')),
  title text not null check (char_length(title) between 1 and 200),
  request_id uuid references shopping_discovery_requests(id),
  order_id uuid references shopping_orders(id),
  assignee text,
  closed_at timestamptz,
  customer_unread integer not null default 0 check (customer_unread >= 0),
  admin_unread integer not null default 0 check (admin_unread >= 0),
  last_message_at timestamptz not null default now(),
  last_preview text not null default '',
  last_sender text,
  response_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'REQUEST' or request_id is not null),
  check (kind <> 'ORDER' or order_id is not null)
);
create unique index if not exists shopping_chat_request_uidx on shopping_chat_threads (request_id) where request_id is not null and kind = 'REQUEST';
create unique index if not exists shopping_chat_order_uidx on shopping_chat_threads (order_id) where kind = 'ORDER';
create index if not exists shopping_chat_owner_idx on shopping_chat_threads (customer_auth_subject, last_message_at desc);
create index if not exists shopping_chat_queue_idx on shopping_chat_threads (closed_at, response_due_at);
create index if not exists shopping_chat_idle_idx on shopping_chat_threads (last_message_at) where closed_at is null;

create table if not exists shopping_chat_attachments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references shopping_chat_threads(id) on delete cascade,
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
  bytes bytea not null check (octet_length(bytes) <= 5242880),
  expires_at timestamptz not null default now() + interval '90 days',
  created_at timestamptz not null default now()
);
create index if not exists shopping_chat_attach_expiry_idx on shopping_chat_attachments (expires_at);

create table if not exists shopping_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references shopping_chat_threads(id) on delete cascade,
  sender text not null check (sender in ('CUSTOMER','ADMIN','SYSTEM')),
  sender_name text not null default '',
  body text not null default '' check (char_length(body) <= 2000),
  internal boolean not null default false,
  card jsonb,
  attachment_id uuid references shopping_chat_attachments(id) on delete set null,
  client_key uuid,
  created_at timestamptz not null default now(),
  check (body <> '' or card is not null or attachment_id is not null),
  check (not internal or sender = 'ADMIN')
);
create index if not exists shopping_chat_messages_idx on shopping_chat_messages (thread_id, created_at);
create unique index if not exists shopping_chat_messages_key_uidx on shopping_chat_messages (thread_id, client_key) where client_key is not null;
grant select, insert, update, delete on shopping_chat_threads, shopping_chat_messages, shopping_chat_attachments to djiwatravel_app;
