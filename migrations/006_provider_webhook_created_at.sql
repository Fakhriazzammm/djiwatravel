-- Backfill the timestamp required by the admin event index; safe for existing installs.
ALTER TABLE public.provider_webhook_events
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
