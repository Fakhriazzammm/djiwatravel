-- Additive admin/operations schema. Execute only after production backup and schema verification.
create table if not exists admin_users (
  id uuid primary key,
  auth_subject text not null unique,
  email text not null unique,
  display_name text not null,
  active boolean not null default true,
  mfa_enabled boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists admin_roles (
  id uuid primary key,
  code text not null unique,
  name text not null,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists admin_user_roles (
  admin_user_id uuid not null references admin_users(id) on delete cascade,
  role_id uuid not null references admin_roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (admin_user_id, role_id)
);
create table if not exists admin_sessions (
  id uuid primary key,
  admin_user_id uuid not null references admin_users(id) on delete cascade,
  session_hash text not null unique,
  ip_hash text,
  user_agent_hash text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists admin_audit_logs (
  id uuid primary key,
  actor_id uuid references admin_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  request_id text,
  before_json jsonb,
  after_json jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create table if not exists admin_settings (
  setting_key text primary key,
  value_json jsonb not null,
  version integer not null default 1,
  effective_from timestamptz not null default now(),
  updated_by uuid references admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists admin_decision_acknowledgements (
  id uuid primary key,
  admin_user_id uuid references admin_users(id) on delete set null,
  decision_key text not null,
  action_taken text not null,
  reason text,
  created_at timestamptz not null default now()
);
create table if not exists worker_heartbeats (
  worker_name text primary key,
  status text not null,
  last_seen_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists provider_webhook_events (
  id uuid primary key,
  provider text not null,
  event_key text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);
create table if not exists payment_webhook_events (
  id uuid primary key,
  provider text not null,
  event_key text not null unique,
  transaction_id text,
  order_id text,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);
create table if not exists support_cases (
  id uuid primary key,
  public_case_code text not null unique,
  order_id text,
  customer_id text,
  category text not null,
  priority text not null default 'normal',
  status text not null default 'open',
  assignee_id uuid references admin_users(id) on delete set null,
  subject text not null,
  description text not null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.provider_webhook_events add column if not exists created_at timestamptz not null default now();

create index if not exists admin_audit_logs_entity_idx on admin_audit_logs(entity_type, entity_id, created_at desc);
create index if not exists admin_audit_logs_actor_idx on admin_audit_logs(actor_id, created_at desc);
create index if not exists admin_sessions_active_idx on admin_sessions(admin_user_id, expires_at) where revoked_at is null;
create index if not exists payment_webhook_events_order_idx on payment_webhook_events(order_id, created_at desc);
create index if not exists provider_webhook_events_provider_idx on provider_webhook_events(provider, created_at desc);
create index if not exists support_cases_status_idx on support_cases(status, priority, updated_at desc);

alter table admin_users enable row level security;
alter table admin_roles enable row level security;
alter table admin_user_roles enable row level security;
alter table admin_sessions enable row level security;
alter table admin_audit_logs enable row level security;
alter table admin_settings enable row level security;
alter table admin_decision_acknowledgements enable row level security;
alter table worker_heartbeats enable row level security;
alter table provider_webhook_events enable row level security;
alter table payment_webhook_events enable row level security;
alter table support_cases enable row level security;
-- No anon/authenticated policies are intentionally created. Access must go through an authenticated server-side admin service.
