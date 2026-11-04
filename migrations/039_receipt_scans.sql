-- Scan struk pengeluaran: a log of AI receipt reads (quota, stats, cost) and the optional receipt photo
-- attached to an expense. Additive and safe to rerun.
create table if not exists public.travel_receipt_scans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  status text not null check (status in ('ready', 'check', 'unreadable', 'not_receipt', 'error')),
  model text not null,
  escalated boolean not null default false,
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  cost_idr numeric(12, 4) not null default 0 check (cost_idr >= 0),
  edited boolean not null default false,
  saved_expense_id uuid references public.travel_expenses(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists travel_receipt_scans_owner_day_idx
  on public.travel_receipt_scans (customer_auth_subject, created_at desc);
create index if not exists travel_receipt_scans_created_idx
  on public.travel_receipt_scans (created_at desc);

-- One compressed photo per scan. It is attached to an expense only when the traveler keeps it;
-- unsaved photos are purged after a day.
create table if not exists public.travel_receipt_photos (
  scan_id uuid primary key references public.travel_receipt_scans(id) on delete cascade,
  trip_id uuid not null references public.travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes bytea not null,
  expense_id uuid references public.travel_expenses(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists travel_receipt_photos_expense_idx
  on public.travel_receipt_photos (expense_id) where expense_id is not null;
create index if not exists travel_receipt_photos_unsaved_idx
  on public.travel_receipt_photos (created_at) where expense_id is null;
