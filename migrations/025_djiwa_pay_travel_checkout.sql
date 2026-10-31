-- Allow the direct wallet method while retaining stored Virtual Account rows for history.
-- New checkout input is separately restricted to QRIS and Djiwa Pay in the server validator.
ALTER TABLE public.guest_order_access
  DROP CONSTRAINT IF EXISTS guest_order_access_payment_method_check;

ALTER TABLE public.guest_order_access
  ADD CONSTRAINT guest_order_access_payment_method_check
  CHECK (payment_method = ANY (ARRAY['qris'::text, 'va'::text, 'djiwa_pay'::text])) NOT VALID;

ALTER TABLE public.guest_order_access
  VALIDATE CONSTRAINT guest_order_access_payment_method_check;
