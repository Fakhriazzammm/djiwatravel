-- Feeds: "Titip Belanja" posts (members share what they received) plus four example posts with photos.
-- Example posts are source 'seed' (Admin shows them as "Contoh"); photos live in public/assets/feeds.

alter table feed_posts drop constraint if exists feed_posts_kind_check;
alter table feed_posts add constraint feed_posts_kind_check check (kind in ('cerita','tips','tanya','titip'));

insert into feed_posts (id, customer_auth_subject, author_name, source, kind, body, destination_code,
                        link_path, link_label, image_url, status, like_count, comment_count, created_at, published_at)
values
  ('5eed0003-0000-4000-8000-000000000001','seed:maya','Maya','seed','titip',
   'Pertama kali titip Uniqlo lewat Djiwa. Empat potong sweter dan fleece sampai dengan rapi, ukurannya pas semua.',
   'JP','/titip-belanja','Titip belanja dari Jepang','/assets/feeds/titip-baju.jpg','PUBLISHED',11,0,
   now() - interval '3 hours', now() - interval '3 hours'),
  ('5eed0003-0000-4000-8000-000000000002','seed:nadia','Nadia','seed','titip',
   'Akhirnya dapat tas lipat navy yang dari dulu dicari. Dibungkus aman pakai kertas, tinggal dipakai.',
   'JP','/titip-belanja','Titip belanja dari Jepang','/assets/feeds/titip-tas.jpg','PUBLISHED',8,0,
   now() - interval '14 hours', now() - interval '14 hours'),
  ('5eed0003-0000-4000-8000-000000000003','seed:fajar','Fajar','seed','titip',
   'Titip camilan dan masker buat oleh-oleh kantor. Semuanya lengkap sesuai daftar, tinggal bagi-bagi.',
   'JP','/titip-belanja','Titip belanja dari Jepang','/assets/feeds/titip-snack.jpg','PUBLISHED',15,0,
   now() - interval '1 day 10 hours', now() - interval '1 day 10 hours'),
  ('5eed0003-0000-4000-8000-000000000004','seed:rina','Rina','seed','titip',
   'Paket sampai di rumah dalam keadaan rapi, tiap baju dibungkus plastik terpisah. Ada kartu ucapan kecil juga.',
   'JP','/titip-belanja','Titip belanja dari Jepang','/assets/feeds/titip-paket.jpg','PUBLISHED',6,0,
   now() - interval '3 days', now() - interval '3 days')
on conflict (id) do nothing;

insert into feed_comments (id, post_id, customer_auth_subject, author_name, source, body, like_count, created_at)
select c.id::uuid, c.post_id::uuid, c.subject, c.name, 'seed', c.body, c.likes, now() - c.age
from (values
  ('5eed0004-0000-4000-8000-000000000001','5eed0003-0000-4000-8000-000000000001','seed:rina','Rina','Fleece-nya lucu! Itu ukuran apa, M?',3, interval '2 hours'),
  ('5eed0004-0000-4000-8000-000000000002','5eed0003-0000-4000-8000-000000000002','seed:maya','Maya','Warnanya cantik banget, cocok buat kerja.',4, interval '10 hours'),
  ('5eed0004-0000-4000-8000-000000000003','5eed0003-0000-4000-8000-000000000003','seed:nadia','Nadia','Wah, jadi pengin titip camilan juga buat akhir pekan.',2, interval '1 day')
) as c(id, post_id, subject, name, body, likes, age)
where exists (select 1 from feed_posts where id = c.post_id::uuid)
on conflict (id) do nothing;

update feed_posts p set comment_count = (
  select count(*) from feed_comments c where c.post_id = p.id and c.status = 'PUBLISHED'
) where p.id::text like '5eed0003-%';
