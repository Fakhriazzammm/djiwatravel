-- 085_japan_template_budget.sql
-- One-off data fix: the "Japan Trip by Azzam" template was published before templates carried a
-- budget, and its source trip only has a lump sum (Rp 15.000.000, 1 traveler, no categories).
-- Gives it a per-traveler budget that adds up to that same total, plus planned costs for the
-- activities that clearly cost money (all rounded estimates). Touches only this slug, only where
-- nothing is set yet, so it is safe to rerun and a no-op on databases without the template.

BEGIN;

update trip_templates
   set budget_json = '{"totalIdr":15000000,"categories":[
         {"name":"Akomodasi","amountIdr":5850000},
         {"name":"Transportasi","amountIdr":3000000},
         {"name":"Makan","amountIdr":3300000},
         {"name":"Tiket & aktivitas","amountIdr":1950000},
         {"name":"Belanja & lainnya","amountIdr":900000}]}'::jsonb,
       updated_at = now()
 where slug = 'japan-trip-by-azzam-98bd26a2' and budget_json is null;

update trip_template_items i
   set cost_idr = c.cost
  from (values
         ('Shinkansen ke Osaka', 1600000),
         ('Universal Studios Japan', 900000),
         ('Tsukiji + teamLab Planets', 400000),
         ('Sensoji + Tokyo Skytree', 250000),
         ('Osaka Castle + Umeda Sky', 230000),
         ('Tsutenkaku + Shinsekai', 100000),
         ('Ke Kansai Airport', 160000),
         ('Makan malam Shibuya', 150000),
         ('Makan siang Shinsekai', 100000),
         ('Namba Parks + makan malam', 150000),
         ('Dotonbori malam', 150000),
         ('Belanja Shinsaibashi', 500000)
       ) as c(title, cost)
 where i.template_id = (select id from trip_templates where slug = 'japan-trip-by-azzam-98bd26a2')
   and i.title = c.title and i.cost_idr is null;

COMMIT;
