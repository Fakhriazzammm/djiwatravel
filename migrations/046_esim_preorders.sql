-- Bound schema locks; deploy retries are safe if a busy table causes a timeout.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Paid eSIM preorders. Existing orders remain on the instant path by default.
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS fulfillment_mode text NOT NULL DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS preorder_status text,
  ADD COLUMN IF NOT EXISTS preorder_deadline_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_orders'::regclass
      AND conname = 'customer_orders_fulfillment_mode_check'
  ) THEN
    ALTER TABLE public.customer_orders
      ADD CONSTRAINT customer_orders_fulfillment_mode_check
      CHECK (fulfillment_mode IN ('instant', 'preorder'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_orders'::regclass
      AND conname = 'customer_orders_preorder_status_check'
  ) THEN
    ALTER TABLE public.customer_orders
      ADD CONSTRAINT customer_orders_preorder_status_check
      CHECK (preorder_status IS NULL OR preorder_status IN ('pending_payment', 'pending', 'processing', 'refund_review', 'fulfilled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_orders'::regclass
      AND conname = 'customer_orders_preorder_fields_check'
  ) THEN
    ALTER TABLE public.customer_orders
      ADD CONSTRAINT customer_orders_preorder_fields_check
      CHECK (
        (fulfillment_mode = 'instant' AND preorder_status IS NULL AND preorder_deadline_at IS NULL)
        OR (fulfillment_mode = 'preorder' AND preorder_status = 'pending_payment' AND preorder_deadline_at IS NULL)
        OR (fulfillment_mode = 'preorder' AND preorder_status IN ('pending', 'processing', 'refund_review', 'fulfilled') AND preorder_deadline_at IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS customer_orders_preorder_queue_idx
  ON public.customer_orders (preorder_status, preorder_deadline_at, created_at)
  WHERE fulfillment_mode = 'preorder';

-- Durable transactional mail. The Helipod idempotency key is the outbox key.
CREATE TABLE IF NOT EXISTS public.travel_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE RESTRICT,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS travel_email_outbox_queue_idx
  ON public.travel_email_outbox (status, available_at, created_at);
ALTER TABLE public.travel_email_outbox ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.travel_email_outbox TO djiwatravel_app;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'travel_email_outbox' AND policyname = 'travel_email_runtime') THEN
    CREATE POLICY travel_email_runtime ON public.travel_email_outbox
      TO djiwatravel_app USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON COLUMN public.customer_orders.fulfillment_mode IS
  'instant for normal purchases; preorder when a paid customer is awaiting provider balance.';
COMMENT ON COLUMN public.customer_orders.preorder_status IS
  'pending_payment before settlement, then pending, processing, refund_review, or fulfilled; null for instant orders.';
COMMENT ON COLUMN public.customer_orders.preorder_deadline_at IS
  'Three days after verified payment; overdue pending orders move to admin refund review.';
