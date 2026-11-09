-- Bag brands (Legato Largo, anello, Longchamp) and the "Tas" category join the shopper catalog.
alter table shopping_catalog_items drop constraint if exists shopping_catalog_items_brand_check;
alter table shopping_catalog_items add constraint shopping_catalog_items_brand_check
  check (brand in ('uniqlo','gu','legato','anello','longchamp','donki','muji'));
alter table shopping_catalog_items drop constraint if exists shopping_catalog_items_category_check;
alter table shopping_catalog_items add constraint shopping_catalog_items_category_check
  check (category in ('Atasan','Bawahan','Jaket','Inner','Tas','Lainnya'));
