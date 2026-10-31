-- Neutral payment-contact store that works with both authenticated and guest orders.
-- Copies existing guest_order_access rows so no historical contact data is lost.
CREATE TABLE IF NOT EXISTS public.customer_order_payment_details (
  order_id    uuid PRIMARY KEY REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  email       text NOT NULL,
  whatsapp    text NOT NULL,
  payment_method text NOT NULL
    CHECK (payment_method = ANY (ARRAY['qris','va','djiwa_pay'])),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_order_payment_details ENABLE ROW LEVEL SECURITY;

-- Back-fill from the legacy guest table (idempotent)
INSERT INTO public.customer_order_payment_details
       (order_id, email, whatsapp, payment_method, created_at)
SELECT g.order_id, g.email, g.whatsapp, g.payment_method, g.created_at
FROM   public.guest_order_access g
ON CONFLICT (order_id) DO NOTHING;
