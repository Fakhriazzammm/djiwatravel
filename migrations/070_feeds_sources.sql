-- Feeds: post origin (member / seed / guide), an optional link card and a static cover image.
-- Seed posts are example content under made-up first names so the timeline is not empty at launch;
-- Admin can remove them one by one (Feeds > Semua post). Guide posts ("Travo Guide") are created by
-- the server from the published guides in src/lib/travel-guides.ts.

alter table feed_posts add column if not exists source text not null default 'member'
  check (source in ('member','seed','guide'));
alter table feed_posts add column if not exists link_path text;
alter table feed_posts add column if not exists link_label text check (link_label is null or char_length(link_label) <= 160);
alter table feed_posts add column if not exists image_url text;
create unique index if not exists feed_posts_guide_link_idx on feed_posts (link_path) where source = 'guide';

insert into feed_posts (id, customer_auth_subject, author_name, source, kind, body, destination_code, place_name,
                        status, like_count, comment_count, created_at, published_at)
values
  ('5eed0001-0000-4000-8000-000000000001','seed:rani','Rani','seed','tips',
   'Datang 30 menit sebelum matahari terbenam ke Shibuya Sky. Antreannya jauh lebih pendek dan kamu dapat pemandangan siang sampai malam sekaligus.',
   'JP','Shibuya Sky','PUBLISHED',9,0, now() - interval '2 hours', now() - interval '2 hours'),
  ('5eed0001-0000-4000-8000-000000000002','seed:dimas','Dimas','seed','tanya',
   'Ada yang pernah pakai eSIM di Shinkansen? Sinyalnya stabil nggak ya sepanjang Tokyo–Kyoto?',
   'JP',null,'PUBLISHED',3,0, now() - interval '5 hours', now() - interval '5 hours'),
  ('5eed0001-0000-4000-8000-000000000003','seed:sari','Sari','seed','tips',
   'Hari ketiga di Seoul akhirnya ketemu kedai tteokbokki kecil di dalam pasar. Antre sebentar, tapi worth it banget buat sarapan.',
   'KR','Gwangjang Market','PUBLISHED',6,0, now() - interval '9 hours', now() - interval '9 hours'),
  ('5eed0001-0000-4000-8000-000000000004','seed:tia','Tia','seed','tips',
   'Di Singapura cukup tap kartu kontaktless atau ponsel di gerbang MRT, jadi nggak perlu antre beli kartu atau top up dulu.',
   'SG',null,'PUBLISHED',12,0, now() - interval '1 day 2 hours', now() - interval '1 day 2 hours'),
  ('5eed0001-0000-4000-8000-000000000005','seed:bayu','Bayu','seed','tanya',
   'Mau ke Bangkok 4 hari bulan depan. Area mana yang paling enak buat nginap kalau mau gampang ke BTS?',
   'TH',null,'PUBLISHED',2,0, now() - interval '1 day 6 hours', now() - interval '1 day 6 hours'),
  ('5eed0001-0000-4000-8000-000000000006','seed:lina','Lina','seed','cerita',
   'Pertama kali ke Kuala Lumpur sendirian dan ternyata nyaman banget. Dari bandara aku langsung pesan taksi online supaya lebih tenang.',
   'MY',null,'PUBLISHED',7,0, now() - interval '2 days', now() - interval '2 days'),
  ('5eed0001-0000-4000-8000-000000000007','seed:putri','Putri','seed','tips',
   'Naik ke Fushimi Inari sebelum jam 8 pagi. Gerbang torii-nya masih sepi, enak buat foto dan jalannya belum panas.',
   'JP','Fushimi Inari','PUBLISHED',14,0, now() - interval '2 days 5 hours', now() - interval '2 days 5 hours')
on conflict (id) do nothing;
