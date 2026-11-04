-- Line items of an expense (e.g. the lines of a scanned receipt), editable one by one.
-- Amounts are in the expense's original currency, in minor units. Additive and safe to rerun.
create table if not exists travel_expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references travel_expenses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  amount_minor bigint not null check (amount_minor > 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists travel_expense_items_expense_idx on travel_expense_items (expense_id, position, created_at);
grant select, insert, update, delete on travel_expense_items to djiwatravel_app;
