-- Refund decisions are local audit state only. Mayar/provider execution remains a separate, unverified contract.
GRANT SELECT, INSERT, UPDATE ON TABLE public.refund_requests, public.refund_events
  TO djiwatravel_app;
