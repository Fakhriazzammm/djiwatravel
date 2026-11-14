-- Feeds: private bookmarks ("Tersimpan" in the Feeds dock). Only the owner ever reads them.
create table if not exists feed_bookmarks (
  post_id uuid not null references feed_posts(id) on delete cascade,
  customer_auth_subject text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, customer_auth_subject)
);
create index if not exists feed_bookmarks_owner_idx on feed_bookmarks (customer_auth_subject, created_at desc);
