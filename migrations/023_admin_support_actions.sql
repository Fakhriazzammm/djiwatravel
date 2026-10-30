-- Admin support actions remain server-only and use the existing admin allowlist boundary.
grant usage on schema public to djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.support_cases, public.support_case_messages
  to djiwatravel_app;
