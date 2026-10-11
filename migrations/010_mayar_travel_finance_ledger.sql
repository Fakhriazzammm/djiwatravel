-- Travel settlement depends on the canonical Djiwa finance ledger contract.
-- This migration intentionally fails loudly when the shared ledger is absent or
-- incompatible; it never creates a second Travel-specific financial table.
do $$
begin
  if to_regnamespace('pos') is null then
    raise exception 'required finance schema pos is missing';
  end if;
  if to_regclass('pos.financial_transactions') is null then
    raise exception 'required canonical table pos.financial_transactions is missing';
  end if;
  if to_regprocedure('pos.record_mayar_financial_transaction(text,text,numeric,text,double precision,jsonb)') is null then
    raise exception 'required canonical RPC pos.record_mayar_financial_transaction is missing';
  end if;
  if not exists (
    select 1 from pg_attribute a
    where a.attrelid = 'pos.financial_transactions'::regclass
      and a.attname = 'order_source_id'
      and not a.attisdropped
  ) or not exists (
    select 1 from pg_attribute a
    where a.attrelid = 'pos.financial_transactions'::regclass
      and a.attname = 'metadata'
      and not a.attisdropped
  ) then
    raise exception 'canonical finance table lacks required idempotency columns';
  end if;
end;
$$;

-- Mayar Travel callback settlement is atomic and posts finance before success.
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
set search_path = public, pos, pg_catalog
as $$
declare
  v_order public.customer_orders%rowtype;
  v_existing public.payment_webhook_events%rowtype;
  v_ledger jsonb;
  v_gateway jsonb;
begin
  select * into v_order
    from public.customer_orders
   where id = p_order_id
   for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.payment_reference is not null and v_order.payment_reference <> p_invoice_id then raise exception 'invoice_mismatch'; end if;
  if v_order.total_amount <> p_amount then raise exception 'amount_mismatch'; end if;
  if v_order.status not in ('ORDER_CREATED','PAYMENT_PENDING','PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED') then raise exception 'invalid_order_status'; end if;

  -- Only provider identifiers and settlement facts enter finance metadata.
  -- The raw callback can contain QR/LPA or activation data and is never copied.
  v_gateway := jsonb_build_object(
    'provider', 'mayar',
    'eventId', nullif(btrim(p_event_id), ''),
    'invoiceId', nullif(btrim(p_invoice_id), ''),
    'transactionId', nullif(btrim(p_transaction_id), ''),
    'status', 'PAID',
    'currency', v_order.currency_code
  );
  v_ledger := pos.record_mayar_financial_transaction(
    p_order_id::text,
    v_order.public_order_code,
    p_amount,
    null,
    extract(epoch from coalesce(p_paid_at, now())) * 1000,
    v_gateway
  );
  if coalesce((v_ledger->>'ok')::boolean, false) is not true then
    raise exception 'finance_ledger_failed';
  end if;

  select * into v_existing
    from public.payment_webhook_events
   where provider = 'mayar' and provider_event_id = p_event_id
   limit 1;
  if found then return jsonb_build_object('duplicate', true, 'ledger', v_ledger); end if;

  insert into public.payment_webhook_events(provider, provider_event_id, event_type, order_id, status, amount, currency_code, payload, processed_at)
  values ('mayar', p_event_id, 'payment.received', p_order_id, 'PAID', p_amount, v_order.currency_code, p_payload, now());

  if v_order.status in ('PAYMENT_CONFIRMED','PROVISIONING','READY','INSTALLED') then
    return jsonb_build_object('duplicate', true, 'alreadySettled', true, 'ledger', v_ledger);
  end if;

  update public.customer_orders
     set status = 'PAYMENT_CONFIRMED', payment_provider = 'mayar', payment_reference = p_invoice_id, paid_at = p_paid_at, updated_at = now()
   where id = p_order_id;
  return jsonb_build_object('duplicate', false, 'settled', true, 'ledger', v_ledger);
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
