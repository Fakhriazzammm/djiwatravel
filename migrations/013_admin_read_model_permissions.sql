-- Admin read-model runtime permissions. Additive and safe to rerun.
--
-- The server-side admin loaders keep requireAdmin() as their authorization gate;
-- this migration only permits the app role to read the exact support/refund
-- tables used by those loaders. No browser policy or write privilege is added.
GRANT USAGE ON SCHEMA public TO djiwatravel_app;

GRANT SELECT ON TABLE
  public.support_cases,
  public.support_case_messages,
  public.refund_requests,
  public.refund_events
TO djiwatravel_app;
