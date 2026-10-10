-- Runtime permissions for the guest order, Mayar payment and provisioning paths.
--
-- Context: migration 005 granted the app role SELECT+INSERT on the guest order
-- tables only. The Mayar invoice step (status -> PAYMENT_PENDING), the payment
-- webhook bookkeeping and eSIM provisioning therefore failed with
-- "permission denied", which customers saw as
-- "Pesanan belum dapat disimpan. Coba kembali beberapa saat lagi."
--
-- Scope: privilege grants only. No schema, data, RLS policy or function change.
-- DELETE is intentionally not granted: no application path deletes rows.
-- Rollback: REVOKE the same privileges, or restore the recorded pre-change
-- grant state (/root/grants-before-<timestamp>.txt).

GRANT USAGE ON SCHEMA public TO djiwatravel_app;

GRANT SELECT, INSERT, UPDATE ON public.customer_orders TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.customer_order_items TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.guest_order_access TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.payment_webhook_events TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.provider_webhook_events TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.esim_provider_packages TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.esim_price_rules TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.esim_provisioning_orders TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.esim_profiles TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.esim_reconciliation_runs TO djiwatravel_app;

-- Future tables created by the migrator role stay usable by the runtime role.
ALTER DEFAULT PRIVILEGES FOR ROLE djiwatravel_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO djiwatravel_app;
ALTER DEFAULT PRIVILEGES FOR ROLE djiwatravel_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO djiwatravel_app;
