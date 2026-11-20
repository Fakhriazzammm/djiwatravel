-- 086_japan_template_budget_full.sql
-- The first budget for "Japan Trip by Azzam" (085) left out what the trip needs before it starts:
-- flights, eSIM, visa and insurance. This replaces it with a full per-traveler budget.
-- Flights use the cheapest recorded fares of our flight search (Jakarta > Tokyo about Rp 3,4 jt,
-- Osaka > Jakarta about Rp 4,8 jt, one way each, not real time); the eSIM is a 10 GB / 30 day
-- Japan plan. Everything else keeps the earlier estimates. Touches only this slug and is safe
-- to rerun; it is a no-op on databases that do not have the template.

BEGIN;

update trip_templates
   set budget_json = '{"totalIdr":24050000,"categories":[
         {"name":"Tiket pesawat","amountIdr":8200000,"note":"Jakarta ke Tokyo + Osaka ke Jakarta, harga tercatat pencarian tiket kita (bisa berubah)"},
         {"name":"Akomodasi","amountIdr":5850000,"note":"10 malam, hotel bisnis atau hostel"},
         {"name":"Transportasi lokal","amountIdr":3000000,"note":"Shinkansen Tokyo ke Osaka + kereta harian"},
         {"name":"Makan","amountIdr":3300000},
         {"name":"Tiket & aktivitas","amountIdr":1950000,"note":"Universal Studios, teamLab, Skytree, Osaka Castle"},
         {"name":"eSIM & internet","amountIdr":150000,"note":"Paket Jepang 10 GB, 30 hari"},
         {"name":"Visa & asuransi","amountIdr":700000,"note":"Visa turis Jepang + asuransi perjalanan"},
         {"name":"Belanja & lainnya","amountIdr":900000}]}'::jsonb,
       updated_at = now()
 where slug = 'japan-trip-by-azzam-98bd26a2';

COMMIT;
