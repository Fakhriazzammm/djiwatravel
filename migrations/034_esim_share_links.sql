-- Public "give this eSIM to someone" links.
-- The bearer token is the capability: only its SHA-256 is used for lookup, and an encrypted copy
-- lets the owner copy the link again. The first person to press "Buka eSIM" claims the link; the
-- claim is bound to that browser by an HttpOnly cookie whose hash is kept here, so a forwarded
-- link (or a chat link-preview bot) cannot reveal the QR to anyone else. Additive and rerunnable.
create table if not exists esim_share_links (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  token_hash text not null unique,
  token_encrypted text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text,
  claimed_at timestamptz,
  claim_hash text,
  view_count integer not null default 0,
  last_opened_at timestamptz
);

-- One active link per order keeps revocation predictable.
create unique index if not exists esim_share_links_active_order_idx
  on esim_share_links (order_id)
  where revoked_at is null;
create index if not exists esim_share_links_order_idx
  on esim_share_links (order_id, created_at desc);

alter table esim_share_links enable row level security;
grant select, insert, update, delete on esim_share_links to djiwatravel_app;
