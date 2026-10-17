-- Wave 4b additive customer notification/refund read foundations. Safe to rerun.
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(), event_key text not null unique,
  event_type text not null, safe_payload jsonb not null default '{}'::jsonb,
  authoritative_source text not null, authoritative_source_id text,
  created_at timestamptz not null default now()
);
create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.notification_events(id) on delete restrict,
  recipient_customer_auth_subject text not null, order_id uuid references public.customer_orders(id) on delete set null,
  type text not null, title text not null, body text not null, action_href text,
  created_at timestamptz not null default now(), expires_at timestamptz
);
create table if not exists public.customer_notification_states (
  notification_id uuid not null references public.customer_notifications(id) on delete cascade,
  recipient_customer_auth_subject text not null, read_at timestamptz,
  primary key (notification_id, recipient_customer_auth_subject)
);
create table if not exists public.customer_push_subscriptions (
  id uuid primary key default gen_random_uuid(), recipient_customer_auth_subject text not null,
  endpoint_hash text not null, endpoint text not null, keys jsonb not null default '{}'::jsonb,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (recipient_customer_auth_subject, endpoint_hash)
);
create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(), notification_id uuid not null references public.customer_notifications(id) on delete cascade,
  channel text not null, subscription_id uuid references public.customer_push_subscriptions(id) on delete set null,
  status text not null, retry_count integer not null default 0, provider_reference text, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (notification_id, channel, subscription_id)
);
create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.customer_orders(id) on delete restrict,
  recipient_customer_auth_subject text not null, idempotency_key text not null,
  eligibility_snapshot jsonb not null default '{}'::jsonb, status text not null default 'REQUESTED',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), provider_reference text, provider_error text,
  unique (recipient_customer_auth_subject, idempotency_key)
);
create table if not exists public.refund_events (
  id uuid primary key default gen_random_uuid(), refund_request_id uuid not null references public.refund_requests(id) on delete cascade,
  event_key text not null unique, event_type text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists customer_notifications_recipient_created_idx on public.customer_notifications(recipient_customer_auth_subject, created_at desc);
create index if not exists refund_requests_order_idx on public.refund_requests(order_id);
DO $$ declare t text; begin foreach t in array array['notification_events','customer_notifications','customer_notification_states','customer_push_subscriptions','notification_delivery_attempts','refund_requests','refund_events'] loop execute format('alter table public.%I enable row level security', t); end loop; end $$;
create unique index if not exists notification_delivery_attempts_notification_channel_subscription_uq
  on public.notification_delivery_attempts(notification_id, channel, coalesce(subscription_id, '00000000-0000-0000-0000-000000000000'::uuid));
