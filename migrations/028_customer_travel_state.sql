-- Account-scoped travel state that used to live only in one browser's localStorage, so a signed-in
-- customer sees the same trip plan and notification choice on every device.
CREATE TABLE IF NOT EXISTS public.customer_trip_plans (
  customer_auth_subject text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  departure_date text CHECK (departure_date IS NULL OR departure_date ~ '^\d{4}-\d{2}-\d{2}$'),
  completed jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_updated_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_auth_subject, order_id)
);

CREATE TABLE IF NOT EXISTS public.customer_preferences (
  customer_auth_subject text PRIMARY KEY,
  esim_notify boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.customer_trip_plans TO djiwatravel_app;
GRANT SELECT, INSERT, UPDATE ON public.customer_preferences TO djiwatravel_app;
