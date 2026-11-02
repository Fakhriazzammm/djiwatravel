-- Affiliate (referral) program. Additive and safe to rerun.
-- Money here is a commission *record* only. Wallet balance, ledger and settlement stay in Djiwa Pay;
-- a payout is an admin-reviewed request that is marked paid with an external reference.
create table if not exists public.affiliate_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null unique,
  code text not null unique check (code ~ '^[A-Z0-9-]{4,24}$'),
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspended_reason text,
  commission_percent_override numeric check (commission_percent_override is null or (commission_percent_override >= 0 and commission_percent_override <= 100)),
  code_changed_at timestamptz,
  terms_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete cascade,
  visitor_hash text not null,
  click_day date not null default current_date,
  landing_path text,
  created_at timestamptz not null default now(),
  unique (affiliate_id, visitor_hash, click_day)
);
create index if not exists affiliate_clicks_affiliate_idx on public.affiliate_clicks(affiliate_id, created_at desc);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete cascade,
  referee_auth_subject text not null unique,
  claim_hash text,
  flagged boolean not null default false,
  flag_reason text,
  locked_at timestamptz not null default now()
);
create index if not exists affiliate_referrals_affiliate_idx on public.affiliate_referrals(affiliate_id, locked_at desc);

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete restrict,
  amount_idr bigint not null check (amount_idr > 0),
  method text not null check (method in ('djiwa_pay', 'bank')),
  destination jsonb not null default '{}'::jsonb,
  status text not null default 'requested' check (status in ('requested', 'approved', 'paid', 'rejected')),
  reference text,
  note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one open payout per affiliate keeps the balance arithmetic unambiguous.
create unique index if not exists affiliate_payouts_one_open_uq
  on public.affiliate_payouts(affiliate_id) where status in ('requested', 'approved');

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.affiliate_referrals(id) on delete restrict,
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete restrict,
  -- One commission per order makes accrual idempotent under webhook/sweep retries.
  order_id uuid not null unique references public.customer_orders(id) on delete restrict,
  base_amount numeric not null check (base_amount >= 0),
  percent numeric not null check (percent >= 0 and percent <= 100),
  amount_idr bigint not null check (amount_idr >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'reversed', 'paid')),
  matures_at timestamptz not null,
  reason text,
  payout_id uuid references public.affiliate_payouts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists affiliate_commissions_affiliate_idx on public.affiliate_commissions(affiliate_id, status);
create index if not exists affiliate_commissions_payout_idx on public.affiliate_commissions(payout_id);

do $$ declare t text; begin
  foreach t in array array['affiliate_accounts','affiliate_clicks','affiliate_referrals','affiliate_payouts','affiliate_commissions'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
