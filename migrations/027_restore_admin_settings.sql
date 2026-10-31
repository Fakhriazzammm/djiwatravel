-- Forward-only repair for a schema where 004_admin_operations.sql is recorded as applied,
-- but its server-owned admin tables are missing. These empty tables restore the existing contract.
CREATE TABLE IF NOT EXISTS public.admin_users (
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

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid primary key,
  actor_id uuid references public.admin_users(id) on delete set null,
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

CREATE TABLE IF NOT EXISTS public.admin_settings (
  setting_key text primary key,
  value_json jsonb not null,
  version integer not null default 1,
  effective_from timestamptz not null default now(),
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_entity_idx
  ON public.admin_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx
  ON public.admin_audit_logs(actor_id, created_at DESC);

-- No client policies: admin access stays behind the authenticated server-side boundary.
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
