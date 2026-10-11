-- Travel production has no `pos` schema. Settlement now posts the
-- allowlisted payment contract to Djiwa Finance over HTTPS and records the
-- result in Travel's own tables from the server runtime.
--
-- Remove the obsolete local RPC if an earlier migration created it. This is
-- intentionally additive and does not inspect or require any shared schema.
drop function if exists public.settle_mayar_travel_payment(text, uuid, text, text, numeric, timestamptz, jsonb);

create index if not exists payment_webhook_events_mayar_order_idx
  on public.payment_webhook_events(provider, order_id, created_at desc)
  where provider = 'mayar';
