-- Update the server-owned one-time checkout amount to US$19.99. The Stripe
-- Price ID remains environment configuration; this database binding records
-- the exact amount the webhook must later reconcile for that configured price.
create or replace function public.billing_bind_intent(p_id uuid,p_owner uuid,p_session text)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.billing_intents;
begin
 select * into v_row from public.billing_intents where id=p_id for update;
 if not found or v_row.owner_id is distinct from p_owner or p_session is null or length(p_session)=0 then raise exception 'Invalid checkout binding'; end if;
 if v_row.session_id is not null and v_row.session_id<>p_session then raise exception 'Checkout already bound'; end if;
 perform public.billing_record_checkout(p_owner,v_row.price_id,v_row.live,p_session,1999,'usd');
 update public.billing_intents set session_id=p_session where id=p_id;
end $$;
