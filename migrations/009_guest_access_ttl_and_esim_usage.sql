-- Additive/idempotent guest bearer expiry and normalized eSIM usage receipt fields.
ALTER TABLE public.guest_order_access
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE public.guest_order_access
SET expires_at = created_at + interval '1 hour'
WHERE expires_at IS NULL;
ALTER TABLE public.guest_order_access
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '1 hour'),
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.provider_webhook_events
  ADD COLUMN IF NOT EXISTS provider_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_usage_total_volume numeric,
  ADD COLUMN IF NOT EXISTS data_usage_order_usage numeric,
  ADD COLUMN IF NOT EXISTS data_usage_remain numeric,
  ADD COLUMN IF NOT EXISTS validity_usage_total_duration numeric,
  ADD COLUMN IF NOT EXISTS validity_usage_expired_time timestamptz,
  ADD COLUMN IF NOT EXISTS validity_usage_remain numeric;

UPDATE public.provider_webhook_events
SET synced_at = COALESCE(synced_at, processed_at, created_at)
WHERE synced_at IS NULL;
