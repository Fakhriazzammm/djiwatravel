-- Repair production schema drift: migration 009 is recorded as applied, but the
-- Mayar invoice path requires this table and production currently lacks it.
-- Keep this forward-only and rerunnable; orders and provider attempts remain intact.
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'CLAIMED'
    CHECK (status IN ('CLAIMED','REQUESTING','PROVIDER_CONFIRMED','UNKNOWN','FAILED','EXPIRED')),
  provider_invoice_id text,
  provider_transaction_id text,
  payment_url text,
  amount numeric NOT NULL,
  currency_code text NOT NULL DEFAULT 'IDR',
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0,
  next_reconcile_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, provider),
  UNIQUE (provider, idempotency_key)
);

CREATE INDEX IF NOT EXISTS payment_intents_reconcile_idx
  ON public.payment_intents(status, next_reconcile_at);

GRANT SELECT, INSERT, UPDATE ON public.payment_intents TO djiwatravel_app;
