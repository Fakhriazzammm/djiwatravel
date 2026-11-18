-- Kirim Barang: customer proof photos (taken at booking), the team's review of them, and the weigh-in
-- photos stay separate by source. Additive; existing weigh-in photos become source 'ADMIN'.

alter table shipping_photos
  add column if not exists source text not null default 'ADMIN'
    check (source in ('CUSTOMER','ADMIN'));

alter table shipping_orders
  add column if not exists photo_review text not null default 'PENDING'
    check (photo_review in ('PENDING','APPROVED','REDO')),
  add column if not exists photo_review_note text
    check (photo_review_note is null or char_length(photo_review_note) <= 400),
  add column if not exists photo_reviewed_at timestamptz;

create index if not exists shipping_photos_order_source_idx on shipping_photos (order_id, source);
