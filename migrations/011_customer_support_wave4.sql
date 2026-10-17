-- Wave 4a customer support foundation. Additive and safe to rerun.
create table if not exists support_cases (
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
  updated_at timestamptz not null default now()
);
do $$
begin
  if to_regclass('public.admin_users') is not null
     and not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.support_cases'::regclass
         and conname = 'support_cases_assignee_id_fkey'
     ) then
    alter table public.support_cases
      add constraint support_cases_assignee_id_fkey
      foreign key (assignee_id) references public.admin_users(id) on delete set null;
  end if;
end;
$$;
alter table support_cases add column if not exists customer_auth_subject text;
alter table support_cases add column if not exists idempotency_key text;
alter table support_cases add column if not exists request_fingerprint text;
alter table support_cases add column if not exists customer_created_at timestamptz;

create table if not exists support_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references support_cases(id) on delete cascade,
  author_type text not null check (author_type in ('customer', 'admin', 'system')),
  author_subject text,
  body text not null,
  client_message_id text,
  request_fingerprint text,
  created_at timestamptz not null default now()
);
create unique index if not exists support_cases_customer_idempotency_uidx
  on support_cases(customer_auth_subject, idempotency_key)
  where customer_auth_subject is not null and idempotency_key is not null;
create unique index if not exists support_case_messages_client_uidx
  on support_case_messages(case_id, client_message_id)
  where client_message_id is not null;
create index if not exists support_cases_customer_subject_idx
  on support_cases(customer_auth_subject, updated_at desc);
create index if not exists support_case_messages_thread_idx
  on support_case_messages(case_id, created_at asc);
alter table support_cases enable row level security;
alter table support_case_messages enable row level security;
-- No browser policies: all customer access is server-side through Better Auth.
