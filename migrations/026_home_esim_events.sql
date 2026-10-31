-- First-party, anonymous funnel events for the Home eSIM card (chip tap, package sheet, promo tap).
-- No customer identifier is stored: only the event, the destination code and the entry source.
CREATE TABLE IF NOT EXISTS public.home_esim_events (
  id bigserial PRIMARY KEY,
  event_name text NOT NULL CHECK (event_name IN ('home_esim_chip_tap', 'home_esim_sheet_open', 'home_esim_promo_tap')),
  destination_code text,
  source text CHECK (source IN ('rail', 'search', 'promo')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_esim_events_created_idx
  ON public.home_esim_events (created_at DESC, event_name);

ALTER TABLE public.home_esim_events ENABLE ROW LEVEL SECURITY;
