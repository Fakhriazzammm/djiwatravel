-- PWA install / offline / push funnel events. Anonymous, additive, safe to rerun.
CREATE TABLE IF NOT EXISTS public.pwa_events (
  id bigserial PRIMARY KEY,
  event_name text NOT NULL,
  platform text NOT NULL DEFAULT 'other',
  standalone boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pwa_events_created_idx ON public.pwa_events(created_at DESC, event_name);
ALTER TABLE public.pwa_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS customer_push_subscriptions_active_idx
  ON public.customer_push_subscriptions(recipient_customer_auth_subject) WHERE active;
