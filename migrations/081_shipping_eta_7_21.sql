-- Kirim Barang: estimasi total 7-21 hari (Bandung 1 + Jakarta 1 + Jepang 5-19).
-- Only rewrites the old default (Jepang 5-7), so an ETA edited in Admin is kept.
update public.admin_settings
set value_json = jsonb_set(value_json, '{eta,toJapanMaxDays}', '19'::jsonb),
    version = version + 1,
    updated_at = now()
where setting_key = 'shipping'
  and (value_json #>> '{eta,toJapanMinDays}')::int = 5
  and (value_json #>> '{eta,toJapanMaxDays}')::int = 7;
