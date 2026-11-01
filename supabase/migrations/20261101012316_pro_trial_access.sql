-- A Pro trial is valid access while the trusted Stripe subscription is trialing.
-- It ends automatically when Stripe changes the stored subscription status or
-- the trial period timestamp expires; it does not create paid invoice coverage.
create or replace function public.billing_effective_access(p_owner uuid,p_template text)
returns table(is_pro boolean,has_template boolean) language sql stable security definer set search_path='' as $$
 select
   (coalesce((select e.paid_through>now() from public.billing_entitlements e where e.owner_id=p_owner),false)
    or exists(select 1 from public.billing_subscription_grants g join public.billing_subscription_invoices i on i.invoice_id=g.invoice_id where g.owner_id=p_owner and g.offer_kind='pro' and g.state='active' and i.status='active' and g.period_end>now())
    or exists(select 1 from public.billing_subscriptions s where s.owner_id=p_owner and s.offer_kind='pro' and s.status='trialing' and s.current_period_end>now())),
   exists(select 1 from public.billing_subscription_grants g join public.billing_subscription_invoices i on i.invoice_id=g.invoice_id where g.owner_id=p_owner and g.offer_kind='template' and g.template_id=p_template and g.state='active' and i.status='active' and g.period_end>now())
$$;

revoke execute on function public.billing_effective_access(uuid,text) from public,anon,authenticated;
grant execute on function public.billing_effective_access(uuid,text) to service_role;
