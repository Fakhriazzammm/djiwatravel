-- 083_feeds_template_posts.sql
-- Feeds: a published itinerary template is shared to the timeline as a post (source 'template').
-- Additive and idempotent. The post follows its template: hidden when the template is switched off,
-- restored when it goes live again (status_reason = 'template_inactive'), removed when it is deleted.

BEGIN;

alter table feed_posts drop constraint if exists feed_posts_source_check;
alter table feed_posts add constraint feed_posts_source_check
  check (source in ('member','seed','guide','template'));

alter table feed_posts add column if not exists template_slug text;
create unique index if not exists feed_posts_template_slug_idx
  on feed_posts (template_slug) where template_slug is not null;

COMMIT;
