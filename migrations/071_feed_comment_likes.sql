-- Feeds: likes on comments, plus example comments under the seed posts so threads are not empty.
-- The timeline card previews one comment per post: the most liked, else the newest.

alter table feed_comments add column if not exists like_count integer not null default 0 check (like_count >= 0);
alter table feed_comments add column if not exists source text not null default 'member'
  check (source in ('member','seed'));

create table if not exists feed_comment_likes (
  comment_id uuid not null references feed_comments(id) on delete cascade,
  customer_auth_subject text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, customer_auth_subject)
);
create index if not exists feed_comments_top_idx on feed_comments (post_id, like_count desc, created_at desc)
  where status = 'PUBLISHED';

insert into feed_comments (id, post_id, customer_auth_subject, author_name, source, body, like_count, created_at)
select c.id::uuid, c.post_id::uuid, c.subject, c.name, 'seed', c.body, c.likes, now() - c.age
from (values
  ('5eed0002-0000-4000-8000-000000000001','5eed0001-0000-4000-8000-000000000001','seed:tia','Tia','Setuju! Aku juga ambil jadwal menjelang sunset, masuknya cepat dan pemandangannya dapat semua.',5, interval '90 minutes'),
  ('5eed0002-0000-4000-8000-000000000002','5eed0001-0000-4000-8000-000000000001','seed:putri','Putri','Bawa jaket tipis ya, di atas anginnya lumayan kencang.',2, interval '40 minutes'),
  ('5eed0002-0000-4000-8000-000000000003','5eed0001-0000-4000-8000-000000000002','seed:rani','Rani','Aman, aku pakai eSIM waktu naik Shinkansen dan sinyalnya hampir tidak putus. Cuma sempat lemot sebentar di terowongan.',8, interval '4 hours'),
  ('5eed0002-0000-4000-8000-000000000004','5eed0001-0000-4000-8000-000000000002','seed:bayu','Bayu','Jangan lupa aktifkan data roaming di pengaturan eSIM sebelum naik.',3, interval '3 hours'),
  ('5eed0002-0000-4000-8000-000000000005','5eed0001-0000-4000-8000-000000000003','seed:lina','Lina','Penasaran banget, boleh tahu nama kedainya?',1, interval '7 hours'),
  ('5eed0002-0000-4000-8000-000000000006','5eed0001-0000-4000-8000-000000000004','seed:dimas','Dimas','Baru tahu, makasih tipsnya!',2, interval '20 hours'),
  ('5eed0002-0000-4000-8000-000000000007','5eed0001-0000-4000-8000-000000000005','seed:sari','Sari','Coba area dekat BTS Siam atau Phrom Phong, gampang ke mana-mana.',6, interval '26 hours'),
  ('5eed0002-0000-4000-8000-000000000008','5eed0001-0000-4000-8000-000000000005','seed:tia','Tia','Kalau aku pilih sekitar Ari, lebih tenang dan banyak kafe.',4, interval '24 hours'),
  ('5eed0002-0000-4000-8000-000000000009','5eed0001-0000-4000-8000-000000000006','seed:rani','Rani','Keren, berani solo trip! Lanjut ke mana habis itu?',1, interval '40 hours'),
  ('5eed0002-0000-4000-8000-000000000010','5eed0001-0000-4000-8000-000000000007','seed:sari','Sari','Pagi memang paling pas, apalagi kalau lagi musim sejuk.',3, interval '2 days')
) as c(id, post_id, subject, name, body, likes, age)
where exists (select 1 from feed_posts where id = c.post_id::uuid)
on conflict (id) do nothing;

update feed_posts p set comment_count = (
  select count(*) from feed_comments c where c.post_id = p.id and c.status = 'PUBLISHED'
) where p.id::text like '5eed0001-%';
