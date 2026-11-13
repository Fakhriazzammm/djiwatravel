-- Feeds antar traveler (Explore): posts, likes, comments, reports and a ban list. Additive.
-- Identity: only `customer_auth_subject` (never shown) and a first-name label are stored with a post.
-- New posts of an account start PENDING until the team approves the first few (Admin setting `feeds`).

create table if not exists feed_posts (
  id uuid primary key default gen_random_uuid(),
  customer_auth_subject text not null,
  author_name text not null check (char_length(author_name) between 1 and 30),
  kind text not null check (kind in ('cerita','tips','tanya')),
  body text not null check (char_length(body) between 1 and 500),
  destination_code char(2),
  place_name text check (place_name is null or char_length(place_name) between 1 and 80),
  photo_mime text check (photo_mime is null or photo_mime in ('image/jpeg','image/png','image/webp')),
  photo_bytes bytea,
  status text not null default 'PENDING' check (status in ('PENDING','PUBLISHED','HIDDEN','REMOVED')),
  status_reason text,
  flag text,
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists feed_posts_public_idx on feed_posts (published_at desc, id desc) where status = 'PUBLISHED';
create index if not exists feed_posts_author_idx on feed_posts (customer_auth_subject, created_at desc);
create index if not exists feed_posts_pending_idx on feed_posts (created_at) where status = 'PENDING';

create table if not exists feed_likes (
  post_id uuid not null references feed_posts(id) on delete cascade,
  customer_auth_subject text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, customer_auth_subject)
);

create table if not exists feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_posts(id) on delete cascade,
  customer_auth_subject text not null,
  author_name text not null check (char_length(author_name) between 1 and 30),
  body text not null check (char_length(body) between 1 and 300),
  status text not null default 'PUBLISHED' check (status in ('PUBLISHED','HIDDEN')),
  created_at timestamptz not null default now()
);
create index if not exists feed_comments_post_idx on feed_comments (post_id, created_at);
create index if not exists feed_comments_author_idx on feed_comments (customer_auth_subject, created_at desc);

create table if not exists feed_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references feed_posts(id) on delete cascade,
  reporter_subject text not null,
  reason text not null check (reason in ('spam','salah','pribadi','kasar','lainnya')),
  status text not null default 'OPEN' check (status in ('OPEN','DISMISSED','ACTIONED')),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_subject)
);
create index if not exists feed_reports_open_idx on feed_reports (status, created_at) where status = 'OPEN';

create table if not exists feed_bans (
  customer_auth_subject text primary key,
  reason text,
  banned_by text not null,
  created_at timestamptz not null default now()
);
