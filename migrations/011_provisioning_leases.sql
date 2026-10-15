-- Prevent concurrent retries/workers from issuing the same provider order.
-- The lease is internal coordination state; it does not change provider contracts.
ALTER TABLE public.esim_provisioning_orders
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS esim_provisioning_orders_lease_idx
  ON public.esim_provisioning_orders(status, lease_expires_at);
