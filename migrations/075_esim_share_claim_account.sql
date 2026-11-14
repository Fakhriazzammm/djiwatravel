-- New claims belong to the verified recipient account so they can reopen the eSIM
-- on another browser. Keep this nullable: legacy claims remain bound to claim_hash cookies.
alter table public.esim_share_links
  add column if not exists claimed_by_subject text;
