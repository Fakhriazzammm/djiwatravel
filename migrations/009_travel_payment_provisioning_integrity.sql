-- Additive/idempotent Wave 0/1 lifecycle hardening for Djiwa Travel.
-- Payment expiry is deliberately separate from eSIM activation validity.
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS esim_activation_expires_at timestamptz;

UPDATE public.customer_orders
   SET payment_expires_at = COALESCE(payment_expires_at, expires_at, created_at + interval '1 hour')
  WHERE payment_expires_at IS NULL
    AND status IN ('DRAFT', 'ORDER_CREATED', 'PAYMENT_PENDING');

ALTER TABLE public.esim_profiles
  ADD COLUMN IF NOT EXISTS installable boolean NOT NULL DEFAULT false;

UPDATE public.esim_profiles
   SET installable = true
 WHERE installable = false
   AND (qr_payload_encrypted IS NOT NULL OR (smdp_address IS NOT NULL AND activation_code_encrypted IS NOT NULL));

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'CLAIMED' CHECK (status IN ('CLAIMED','REQUESTING','PROVIDER_CONFIRMED','UNKNOWN','FAILED','EXPIRED')),
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

-- Existing payment expiry remains readable for old clients; new code reads these fields.
UPDATE public.customer_orders
   SET esim_activation_expires_at = COALESCE(esim_activation_expires_at, expires_at)
 WHERE esim_activation_expires_at IS NULL
   AND status IN ('READY', 'INSTALLED', 'EXPIRED');
