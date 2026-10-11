-- Travel production has no `pos` schema. Settlement now posts the
-- allowlisted payment contract to Djiwa Finance over HTTPS and records the
-- result in Travel's own tables from the server runtime.
--
-- This migration is intentionally additive and does not inspect or modify any
-- shared finance schema. The obsolete local RPC is not recreated or removed.

create index if not exists payment_webhook_events_mayar_order_idx
  on public.payment_webhook_events(provider, order_id, created_at desc)
  where provider = 'mayar';
