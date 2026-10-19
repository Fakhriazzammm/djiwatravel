CREATE TABLE IF NOT EXISTS public.guest_order_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guest_order_recovery_tokens_order_idx
  ON public.guest_order_recovery_tokens(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guest_order_recovery_tokens_expiry_idx
  ON public.guest_order_recovery_tokens(expires_at);

CREATE TABLE IF NOT EXISTS public.travel_waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL CHECK (feature_key IN ('bagasi', 'shopper')),
  destination text NOT NULL CHECK (char_length(destination) BETWEEN 1 AND 80),
  travel_date date,
  email text,
  whatsapp text,
  consent_at timestamptz NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT travel_waitlist_contact_check CHECK (email IS NOT NULL OR whatsapp IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS travel_waitlist_feature_created_idx
  ON public.travel_waitlist_entries(feature_key, created_at DESC);
