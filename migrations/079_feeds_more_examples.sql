-- Feeds: ten more example posts (source 'seed', shown as "Contoh" in Admin) across destinations and kinds.
-- Text only: no new photos. Safe to re-run.

insert into feed_posts (id, customer_auth_subject, author_name, source, kind, body, destination_code, place_name,
                        status, like_count, comment_count, created_at, published_at)
values
  ('5eed0005-0000-4000-8000-000000000001','seed:andi','Andi','seed','tips',
   'Beli Suica atau Pasmo digital di dompet ponsel sebelum berangkat. Sampai Tokyo tinggal tap, nggak perlu antre mesin tiket.',
   'JP',null,'PUBLISHED',18,0, now() - interval '4 hours', now() - interval '4 hours'),
  ('5eed0005-0000-4000-8000-000000000002','seed:wulan','Wulan','seed','tanya',
   'Ada yang tahu toko obat di Osaka yang jual obat flu dan plester kompres dengan label bahasa Inggris? Mau titip buat keluarga.',
   'JP','Dotonbori','PUBLISHED',4,0, now() - interval '7 hours', now() - interval '7 hours'),
  ('5eed0005-0000-4000-8000-000000000003','seed:hendra','Hendra','seed','cerita',
   'Hari pertama di Seoul hujan deras, akhirnya ngopi di kafe kecil dekat Hongdae sampai reda. Ternyata jadi momen paling santai selama trip.',
   'KR','Hongdae','PUBLISHED',9,0, now() - interval '11 hours', now() - interval '11 hours'),
  ('5eed0005-0000-4000-8000-000000000004','seed:maria','Maria','seed','tips',
   'Di Bangkok, minta sopir taksi pakai argo. Kalau menolak, turun saja dan pesan lewat aplikasi, biasanya jauh lebih jelas harganya.',
   'TH',null,'PUBLISHED',13,0, now() - interval '18 hours', now() - interval '18 hours'),
  ('5eed0005-0000-4000-8000-000000000005','seed:yoga','Yoga','seed','tanya',
   'Kalau transit 6 jam di Changi, cukup nggak waktunya keluar ke Jewel dan balik lagi tanpa buru-buru?',
   'SG','Changi Airport','PUBLISHED',5,0, now() - interval '1 day 4 hours', now() - interval '1 day 4 hours'),
  ('5eed0005-0000-4000-8000-000000000006','seed:citra','Citra','seed','cerita',
   'Pertama kali pakai eSIM dari Djiwa di Kuala Lumpur. Scan QR di bandara, dua menit kemudian sudah bisa pesan taksi online.',
   'MY',null,'PUBLISHED',16,0, now() - interval '1 day 9 hours', now() - interval '1 day 9 hours'),
  ('5eed0005-0000-4000-8000-000000000007','seed:eko','Eko','seed','tips',
   'Kalau mau lihat sakura di Kyoto, jalan di sepanjang Philosopher''s Path sebelum jam 9. Setelah itu mulai ramai rombongan tur.',
   'JP','Philosopher''s Path','PUBLISHED',11,0, now() - interval '2 days 2 hours', now() - interval '2 days 2 hours'),
  ('5eed0005-0000-4000-8000-000000000008','seed:dewi','Dewi','seed','titip',
   'Titip skincare dan sunscreen dari drugstore Jepang. Semua tersegel, ada struk dan foto sebelum dikirim, jadi tenang.',
   'JP',null,'PUBLISHED',10,0, now() - interval '2 days 8 hours', now() - interval '2 days 8 hours'),
  ('5eed0005-0000-4000-8000-000000000009','seed:rio','Rio','seed','tanya',
   'Pakai Wi-Fi hotel atau eSIM lebih nyaman buat kerja remote seminggu di Taipei? Butuh video call tiap pagi.',
   'TW',null,'PUBLISHED',6,0, now() - interval '3 days 3 hours', now() - interval '3 days 3 hours'),
  ('5eed0005-0000-4000-8000-00000000000a','seed:fitri','Fitri','seed','tips',
   'Bawa tas lipat kosong di koper waktu ke Bangkok. Belanja oleh-oleh jadi tidak perlu beli koper baru di akhir trip.',
   'TH',null,'PUBLISHED',8,0, now() - interval '3 days 10 hours', now() - interval '3 days 10 hours')
on conflict (id) do nothing;

-- The Titip Belanja example links to the service, like the earlier ones.
update feed_posts set link_path = '/titip-belanja', link_label = 'Titip belanja dari Jepang'
where id = '5eed0005-0000-4000-8000-000000000008' and link_path is null;
