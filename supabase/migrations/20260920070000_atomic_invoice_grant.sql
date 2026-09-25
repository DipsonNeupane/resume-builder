-- An invoice must not grant access unless its reversible payment mapping
-- commits in the same transaction. Both existing RPCs run inside this call.
create function public.billing_apply_mapped_subscription_invoice(
 p_subscription_id text,p_invoice_id text,p_owner_id uuid,p_price_id text,
 p_live boolean,p_amount_paid bigint,p_currency text,p_period_start timestamptz,
 p_period_end timestamptz,p_verified_at timestamptz,p_payment_intent_id text
) returns table(paid_through timestamptz,applied boolean)
language plpgsql security definer set search_path='' as $$
declare v_result record;
begin
 select * into v_result from public.billing_apply_subscription_invoice(
  p_subscription_id,p_invoice_id,p_owner_id,p_price_id,p_live,p_amount_paid,
  p_currency,p_period_start,p_period_end,p_verified_at);
 perform public.billing_record_subscription_invoice_payment_intent(p_invoice_id,p_payment_intent_id);
 return query select v_result.paid_through::timestamptz,v_result.applied::boolean;
end $$;
revoke all on function public.billing_apply_mapped_subscription_invoice(text,text,uuid,text,boolean,bigint,text,timestamptz,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.billing_apply_mapped_subscription_invoice(text,text,uuid,text,boolean,bigint,text,timestamptz,timestamptz,timestamptz,text) to service_role;
