-- First-party, anonymous storefront traffic: page views, key actions and clicks.
-- No IP, user agent, account or contact data is stored. session_id is a random per-tab-session id.
CREATE TABLE IF NOT EXISTS public.site_events (
  id bigserial PRIMARY KEY,
  event_name text NOT NULL CHECK (event_name IN ('page_view', 'click', 'finder_submit', 'checkout_start', 'destination_view')),
  path text NOT NULL,
  target text,
  session_id text NOT NULL,
  referrer_host text,
  utm_source text,
  device text NOT NULL DEFAULT 'other' CHECK (device IN ('mobile', 'tablet', 'desktop', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_events_created_idx
  ON public.site_events (created_at DESC, event_name);
CREATE INDEX IF NOT EXISTS site_events_session_idx
  ON public.site_events (session_id, created_at);

ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;
