-- Least privilege for server-side guest order drafts, payments and provisioning stay gated.
GRANT USAGE ON SCHEMA public TO djiwatravel_app;
GRANT SELECT, INSERT ON TABLE public.customer_orders, public.customer_order_items, public.guest_order_access TO djiwatravel_app;
