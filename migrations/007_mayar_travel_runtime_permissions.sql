-- Mayar Travel callback settlement is atomic and server-side only.
create or replace function public.settle_mayar_travel_payment(
  p_event_id text,
  p_order_id uuid,
  p_invoice_id text,
  p_transaction_id text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.customer_orders%rowtype;
  v_existing public.payment_webhook_events%rowtype;
begin
  select * into v_existing
    from public.payment_webhook_events
   where provider = 'mayar' and provider_event_id = p_event_id
   limit 1;
  if found then return jsonb_build_object('duplicate', true); end if;

  select * into v_order from public.customer_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.payment_reference is not null and v_order.payment_reference <> p_invoice_id then raise exception 'invoice_mismatch'; end if;
  if v_order.total_amount <> p_amount then raise exception 'amount_mismatch'; end if;
  if v_order.status not in ('ORDER_CREATED','PAYMENT_PENDING','PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED') then raise exception 'invalid_order_status'; end if;

  insert into public.payment_webhook_events(provider, provider_event_id, event_type, order_id, status, amount, currency_code, payload, processed_at)
  values ('mayar', p_event_id, 'payment.received', p_order_id, 'PAID', p_amount, 'IDR', p_payload, now());
  if v_order.status in ('PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED') then return jsonb_build_object('duplicate', true, 'alreadySettled', true); end if;
  update public.customer_orders
     set status = 'PAYMENT_CONFIRMED', payment_provider = 'mayar', payment_reference = p_invoice_id, paid_at = p_paid_at, updated_at = now()
   where id = p_order_id;
  return jsonb_build_object('duplicate', false, 'settled', true);
end;
$$;
do $$
declare
  role_name text;
begin
  foreach role_name in array array['public','anon','authenticated'] loop
    if role_name = 'public' or exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on function public.settle_mayar_travel_payment(text, uuid, text, text, numeric, timestamptz, jsonb) from %I', role_name);
    end if;
  end loop;
end;
$$;
grant execute on function public.settle_mayar_travel_payment(text, uuid, text, text, numeric, timestamptz, jsonb) to djiwatravel_app;
