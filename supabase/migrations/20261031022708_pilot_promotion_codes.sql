-- Permit the explicitly marked three-person APWICO pilot discount without
-- opening hosted Checkout to arbitrary Stripe promotion codes. Zero-value
-- subscription periods retain the Stripe promotion ID in both trusted billing
-- state and the invoice ledger; paid invoice reversal mapping remains nullable.

alter table public.billing_offer_checkout_intents
  add column if not exists pilot_promotion_code_id text
  constraint billing_offer_checkout_pilot_promotion_shape
    check (pilot_promotion_code_id is null or pilot_promotion_code_id ~ '^promo_[A-Za-z0-9]+$');

alter table public.billing_subscriptions
  add column if not exists pilot_promotion_code_id text
  constraint billing_subscriptions_pilot_promotion_shape
    check (pilot_promotion_code_id is null or pilot_promotion_code_id ~ '^promo_[A-Za-z0-9]+$');

alter table public.billing_subscription_invoices
  add column if not exists pilot_promotion_code_id text
  constraint billing_subscription_invoices_pilot_promotion_shape
    check (pilot_promotion_code_id is null or pilot_promotion_code_id ~ '^promo_[A-Za-z0-9]+$');

alter table public.billing_subscription_invoices
  drop constraint if exists billing_subscription_invoices_granted_shape;
alter table public.billing_subscription_invoices
  add constraint billing_subscription_invoices_granted_shape check (
    (outcome = 'granted' and period_start is not null and period_end is not null
      and period_end > period_start and granted_paid_through is not null
      and ((amount_paid > 0)
        or (amount_paid = 0 and payment_intent_id is null and pilot_promotion_code_id is not null)))
    or
    (outcome = 'failed' and amount_paid = 0 and granted_paid_through is null)
  );

-- Remove pre-pilot signatures so every writer passes the new trust fields.
drop function public.billing_begin_offer_checkout(uuid,uuid,text,text,boolean);
drop function public.billing_record_offer_subscription(uuid,text,text,boolean,text,boolean,timestamptz,timestamptz,text,text,text);
drop function public.billing_apply_offer_invoice(text,text,uuid,text,text,boolean,bigint,text,timestamptz,timestamptz,timestamptz);

create function public.billing_begin_offer_checkout(
  p_id uuid,p_owner uuid,p_offer_key text,p_price text,p_live boolean,p_pilot_promotion_code_id text
) returns public.billing_offer_checkout_intents language plpgsql security definer set search_path='' as $$
declare v_row public.billing_offer_checkout_intents;
begin
 if p_id is null or p_owner is null or coalesce(length(trim(p_offer_key)),0)=0 or coalesce(length(trim(p_price)),0)=0 or p_live is null
   or (p_pilot_promotion_code_id is not null and p_pilot_promotion_code_id !~ '^promo_[A-Za-z0-9]+$')
 then raise exception 'Invalid offer checkout';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,582));
 select * into v_row from public.billing_offer_checkout_intents where id=p_id;
 if found then
  if v_row.owner_id<>p_owner or v_row.offer_key<>p_offer_key or v_row.price_id<>p_price or v_row.live<>p_live
    or (p_pilot_promotion_code_id is not null and v_row.pilot_promotion_code_id is distinct from p_pilot_promotion_code_id) then raise exception 'Offer checkout mismatch';end if;
  return v_row;
 end if;
 if exists(select 1 from public.billing_subscriptions where owner_id=p_owner and offer_key=p_offer_key and status in ('active','trialing','past_due','unpaid')) then raise exception 'Offer already subscribed';end if;
 if exists(select 1 from public.billing_subscription_grants g join public.billing_subscription_invoices i on i.invoice_id=g.invoice_id where g.owner_id=p_owner and g.offer_key=p_offer_key and g.period_end>now() and i.status='active') then raise exception 'Offer already subscribed';end if;
 if exists(select 1 from public.billing_offer_checkout_intents where owner_id=p_owner and completed_at is null and created_at>now()-interval '24 hours') then raise exception 'Offer checkout already pending';end if;
 if (select count(*) from public.billing_offer_checkout_intents where owner_id=p_owner and created_at>now()-interval '1 hour')>=10 then raise exception 'Offer checkout rate limit';end if;
 insert into public.billing_offer_checkout_intents(id,owner_id,offer_key,price_id,live,pilot_promotion_code_id)
 values(p_id,p_owner,p_offer_key,p_price,p_live,p_pilot_promotion_code_id) returning * into v_row;return v_row;
end $$;

create function public.billing_record_offer_subscription(
  p_owner uuid, p_subscription text, p_price text, p_live boolean, p_status text,
  p_cancel_at_period_end boolean, p_period_start timestamptz, p_period_end timestamptz,
  p_offer_key text, p_offer_kind text, p_template_id text, p_pilot_promotion_code_id text
) returns void language plpgsql security definer set search_path='' as $$
declare v_existing public.billing_subscriptions;
begin
  if p_owner is null or coalesce(length(trim(p_subscription)),0)=0 or coalesce(length(trim(p_price)),0)=0
    or p_live is null or p_status not in ('active','past_due','canceled','incomplete','incomplete_expired','paused','trialing','unpaid')
    or p_cancel_at_period_end is null or p_period_start is null or p_period_end is null or p_period_end<=p_period_start
    or coalesce(length(trim(p_offer_key)),0)=0 or p_offer_kind not in ('pro','template')
    or (p_offer_kind='template' and coalesce(length(trim(p_template_id)),0)=0)
    or (p_offer_kind='pro' and p_template_id is not null)
    or (p_pilot_promotion_code_id is not null and (p_offer_kind<>'pro' or p_pilot_promotion_code_id !~ '^promo_[A-Za-z0-9]+$'))
  then raise exception 'Invalid offer subscription'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_offer_key, 581));
  select * into v_existing from public.billing_subscriptions where subscription_id=p_subscription for update;
  if found and (v_existing.owner_id<>p_owner or v_existing.price_id<>p_price or v_existing.live<>p_live
    or v_existing.offer_key is distinct from p_offer_key or v_existing.offer_kind is distinct from p_offer_kind
    or v_existing.template_id is distinct from p_template_id
    or v_existing.pilot_promotion_code_id is distinct from p_pilot_promotion_code_id)
  then raise exception 'Subscription identity mismatch'; end if;
  insert into public.billing_subscriptions(subscription_id,owner_id,price_id,live,status,cancel_at_period_end,current_period_start,current_period_end,offer_key,offer_kind,template_id,pilot_promotion_code_id)
  values(p_subscription,p_owner,p_price,p_live,p_status,p_cancel_at_period_end,p_period_start,p_period_end,p_offer_key,p_offer_kind,p_template_id,p_pilot_promotion_code_id)
  on conflict(subscription_id) do update set status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,
    current_period_start=least(coalesce(public.billing_subscriptions.current_period_start,excluded.current_period_start),excluded.current_period_start),
    current_period_end=greatest(coalesce(public.billing_subscriptions.current_period_end,excluded.current_period_end),excluded.current_period_end),updated_at=now();
exception when unique_violation then
  raise exception 'An in-force subscription already exists for this offer';
end $$;

create function public.billing_apply_offer_invoice(
  p_subscription text,p_invoice text,p_owner uuid,p_payment_intent text,p_price text,p_live boolean,
  p_amount bigint,p_currency text,p_pilot_promotion_code_id text,
  p_period_start timestamptz,p_period_end timestamptz,p_verified_at timestamptz
) returns void language plpgsql security definer set search_path='' as $$
declare v_sub public.billing_subscriptions; v_existing public.billing_subscription_invoices;
begin
  if coalesce(length(trim(p_subscription)),0)=0 or coalesce(length(trim(p_invoice)),0)=0 or p_owner is null
    or (p_payment_intent is not null and coalesce(length(trim(p_payment_intent)),0)=0)
    or coalesce(length(trim(p_price)),0)=0 or p_live is null or p_amount<0 or lower(p_currency)<>p_currency or length(p_currency)<>3
    or p_period_start is null or p_period_end is null or p_period_end<=p_period_start or p_verified_at is null or p_verified_at>now()+interval '5 minutes'
    or (p_pilot_promotion_code_id is not null and p_pilot_promotion_code_id !~ '^promo_[A-Za-z0-9]+$')
    or (p_amount=0 and (p_payment_intent is not null or p_pilot_promotion_code_id is null))
    or (p_amount>0 and (p_payment_intent is null or p_pilot_promotion_code_id is not null))
  then raise exception 'Invalid offer invoice'; end if;
  select * into v_sub from public.billing_subscriptions where subscription_id=p_subscription for update;
  if not found or v_sub.owner_id<>p_owner or v_sub.price_id<>p_price or v_sub.live<>p_live or v_sub.offer_key is null
    or (p_amount=0 and (v_sub.offer_kind<>'pro' or v_sub.pilot_promotion_code_id is distinct from p_pilot_promotion_code_id))
  then raise exception 'Offer invoice identity mismatch'; end if;
  select * into v_existing from public.billing_subscription_invoices where invoice_id=p_invoice;
  if found then
    if v_existing.subscription_id<>p_subscription or v_existing.owner_id<>p_owner or v_existing.payment_intent_id is distinct from p_payment_intent or v_existing.amount_paid<>p_amount
      or v_existing.pilot_promotion_code_id is distinct from p_pilot_promotion_code_id
      or v_existing.currency<>p_currency or v_existing.period_start<>p_period_start or v_existing.period_end<>p_period_end
    then raise exception 'Invoice replay mismatch'; end if;
    return;
  end if;
  insert into public.billing_subscription_invoices(invoice_id,subscription_id,owner_id,outcome,amount_paid,currency,period_start,period_end,verified_at,granted_paid_through,payment_intent_id,pilot_promotion_code_id)
  values(p_invoice,p_subscription,p_owner,'granted',p_amount,p_currency,p_period_start,p_period_end,p_verified_at,p_period_end,p_payment_intent,p_pilot_promotion_code_id);
  insert into public.billing_subscription_grants(subscription_id,owner_id,offer_key,offer_kind,template_id,invoice_id,period_start,period_end,state)
  values(p_subscription,p_owner,v_sub.offer_key,v_sub.offer_kind,v_sub.template_id,p_invoice,p_period_start,p_period_end,'active')
  on conflict(subscription_id) do update set invoice_id=case when excluded.period_end>=public.billing_subscription_grants.period_end then excluded.invoice_id else public.billing_subscription_grants.invoice_id end,
    period_start=least(public.billing_subscription_grants.period_start,excluded.period_start),
    period_end=greatest(public.billing_subscription_grants.period_end,excluded.period_end),state='active',updated_at=now();
  insert into public.billing_entitlements(owner_id,paid_through) values(p_owner,null) on conflict(owner_id) do nothing;
  update public.billing_subscriptions set status='active',current_period_start=p_period_start,
    current_period_end=greatest(coalesce(current_period_end,p_period_end),p_period_end),updated_at=now()
    where subscription_id=p_subscription;
  if v_sub.offer_kind='pro' then
    insert into public.billing_entitlements(owner_id,paid_through) values(p_owner,p_period_end)
    on conflict(owner_id) do update set paid_through=greatest(public.billing_entitlements.paid_through,excluded.paid_through),updated_at=now();
  end if;
end $$;

revoke execute on function public.billing_begin_offer_checkout(uuid,uuid,text,text,boolean,text),
 public.billing_record_offer_subscription(uuid,text,text,boolean,text,boolean,timestamptz,timestamptz,text,text,text,text),
 public.billing_apply_offer_invoice(text,text,uuid,text,text,boolean,bigint,text,text,timestamptz,timestamptz,timestamptz)
 from public,anon,authenticated;
grant execute on function public.billing_begin_offer_checkout(uuid,uuid,text,text,boolean,text),
 public.billing_record_offer_subscription(uuid,text,text,boolean,text,boolean,timestamptz,timestamptz,text,text,text,text),
 public.billing_apply_offer_invoice(text,text,uuid,text,text,boolean,bigint,text,text,timestamptz,timestamptz,timestamptz)
 to service_role;
