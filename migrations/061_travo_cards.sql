-- Travo can show live product cards (eSIM plans with checkout, flights, guides, trips) under an answer.
-- Only the request is stored (kind + a few search words); prices and plans are looked up again every time. Additive.
alter table travel_assistant_messages add column if not exists cards jsonb;
