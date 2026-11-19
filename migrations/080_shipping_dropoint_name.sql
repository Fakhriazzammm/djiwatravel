-- Kirim Barang: the drop point is "Djiwa Travel Tasikmalaya (Djiwa Tentram Cafe & Resto)".
-- Only rewrites the stored name when it still has the old default, so an edited name is kept.
update public.admin_settings
set value_json = jsonb_set(value_json, '{dropPoint,name}', to_jsonb('Djiwa Travel Tasikmalaya (Djiwa Tentram Cafe & Resto)'::text)),
    version = version + 1,
    updated_at = now()
where setting_key = 'shipping'
  and value_json #>> '{dropPoint,name}' = 'Djiwa Tasikmalaya';
