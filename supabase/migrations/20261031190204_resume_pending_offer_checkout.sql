-- Reuse an owner's existing pending Pro checkout intent after a reload.
-- This preserves Stripe idempotency for sessions that were created but not
-- bound locally, and lets unbound intents safely continue with their original
-- promotion code instead of blocking the owner for 24 hours.

create or replace function public.billing_begin_offer_checkout(
  p_id uuid,p_owner uuid,p_offer_key text,p_price text,p_live boolean,p_pilot_promotion_code_id text
) returns public.billing_offer_checkout_intents language plpgsql security definer set search_path='' as $$
declare v_row public.billing_offer_checkout_intents;
begin
 if p_id is null or p_owner is null or coalesce(length(trim(p_offer_key)),0)=0 or coalesce(length(trim(p_price)),0)=0 or p_live is null
   or (p_pilot_promotion_code_id is not null and p_pilot_promotion_code_id !~ '^promo_[A-Za-z0-9]+$')
 then raise exception 'Invalid offer checkout';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,582));
 select * into v_row from public.billing_offer_checkout_intents where id=p_id for update;
 if found then
  if v_row.owner_id<>p_owner or v_row.offer_key<>p_offer_key or v_row.price_id<>p_price or v_row.live<>p_live
    or (p_pilot_promotion_code_id is not null and v_row.pilot_promotion_code_id is distinct from p_pilot_promotion_code_id) then raise exception 'Offer checkout mismatch';end if;
  return v_row;
 end if;
 -- A retry after reload gets the same intent and Stripe idempotency key.
 select * into v_row from public.billing_offer_checkout_intents
  where owner_id=p_owner and offer_key=p_offer_key and completed_at is null
  order by created_at desc limit 1 for update;
 if found then
  if v_row.price_id<>p_price or v_row.live<>p_live then raise exception 'Offer checkout mismatch';end if;
  if v_row.pilot_promotion_code_id is distinct from p_pilot_promotion_code_id then raise exception 'Offer checkout promotion mismatch';end if;
  return v_row;
 end if;
 if exists(select 1 from public.billing_subscriptions where owner_id=p_owner and offer_key=p_offer_key and status in ('active','trialing','past_due','unpaid')) then raise exception 'Offer already subscribed';end if;
 if exists(select 1 from public.billing_subscription_grants g join public.billing_subscription_invoices i on i.invoice_id=g.invoice_id where g.owner_id=p_owner and g.offer_key=p_offer_key and g.period_end>now() and i.status='active') then raise exception 'Offer already subscribed';end if;
 if exists(select 1 from public.billing_offer_checkout_intents where owner_id=p_owner and completed_at is null and created_at>now()-interval '24 hours') then raise exception 'Offer checkout already pending';end if;
 if (select count(*) from public.billing_offer_checkout_intents where owner_id=p_owner and created_at>now()-interval '1 hour')>=10 then raise exception 'Offer checkout rate limit';end if;
 insert into public.billing_offer_checkout_intents(id,owner_id,offer_key,price_id,live,pilot_promotion_code_id)
 values(p_id,p_owner,p_offer_key,p_price,p_live,p_pilot_promotion_code_id) returning * into v_row;return v_row;
end $$;
