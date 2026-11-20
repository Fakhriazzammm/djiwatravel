-- 087_helipod_email_events.sql
-- Delivery tracking for transactional email sent through Helipod Email. Helipod posts signed
-- webhook events (delivered, bounced, complained, rejected, failed...); the receiver records each
-- event once and keeps the strongest outcome on the outbox row. Additive and idempotent.

BEGIN;

ALTER TABLE public.travel_email_outbox
  ADD COLUMN IF NOT EXISTS provider_email_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text
    CHECK (delivery_status IS NULL OR delivery_status IN ('delivered','bounced','complained','rejected','failed')),
  ADD COLUMN IF NOT EXISTS delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_detail text;

CREATE INDEX IF NOT EXISTS travel_email_outbox_recipient_idx
  ON public.travel_email_outbox (lower(recipient_email), sent_at DESC);
CREATE INDEX IF NOT EXISTS travel_email_outbox_provider_idx
  ON public.travel_email_outbox (provider_email_id) WHERE provider_email_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.travel_email_events (
  event_key text PRIMARY KEY,
  event_type text NOT NULL,
  recipient text,
  message_id text,
  outbox_id uuid REFERENCES public.travel_email_outbox(id) ON DELETE SET NULL,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS travel_email_events_received_idx
  ON public.travel_email_events (received_at DESC);
ALTER TABLE public.travel_email_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE public.travel_email_events TO djiwatravel_app;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'travel_email_events' AND policyname = 'travel_email_events_runtime') THEN
    CREATE POLICY travel_email_events_runtime ON public.travel_email_events
      TO djiwatravel_app USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
