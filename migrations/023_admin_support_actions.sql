-- Forward-only repair for installations whose tracker says Wave 4 was applied but the tables are
-- missing. Every CREATE is conditional; existing rows and columns are preserved.
create table if not exists public.support_cases (
  id uuid primary key,
  public_case_code text not null unique,
  order_id text,
  customer_id text,
  category text not null,
  priority text not null default 'normal',
  status text not null default 'open',
  assignee_id uuid,
  subject text not null,
  description text not null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_auth_subject text,
  idempotency_key text,
  request_fingerprint text,
  customer_created_at timestamptz
);
create table if not exists public.support_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  author_type text not null check (author_type in ('customer', 'admin', 'system')),
  author_subject text,
  body text not null,
  client_message_id text,
  request_fingerprint text,
  created_at timestamptz not null default now()
);
create unique index if not exists support_cases_customer_idempotency_uidx
  on public.support_cases(customer_auth_subject, idempotency_key)
  where customer_auth_subject is not null and idempotency_key is not null;
create unique index if not exists support_case_messages_client_uidx
  on public.support_case_messages(case_id, client_message_id)
  where client_message_id is not null;
create index if not exists support_case_messages_thread_idx
  on public.support_case_messages(case_id, created_at asc);

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete restrict,
  recipient_customer_auth_subject text not null,
  idempotency_key text not null,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'REQUESTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider_reference text,
  provider_error text,
  unique (recipient_customer_auth_subject, idempotency_key)
);

-- Admin support actions remain server-only and use the existing admin allowlist boundary.
grant usage on schema public to djiwatravel_app;
grant usage on schema public to djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.support_cases, public.support_case_messages
  to djiwatravel_app;
