-- Durable idempotency before the Stripe call. Old/uncertain requests are never
-- resubmitted after Stripe's idempotency retention may have expired.
create table public.billing_intents (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  price_id text not null,
  live boolean not null,
  created_at timestamptz not null default now(),
  session_id text unique references public.billing_checkouts(session_id)
);
create index billing_intents_owner_created on public.billing_intents(owner_id,created_at);
alter table public.billing_intents enable row level security;
revoke all on public.billing_intents from public,anon,authenticated,service_role;

create function public.billing_begin_intent(p_id uuid,p_owner uuid,p_price text,p_live boolean)
returns public.billing_intents language plpgsql security definer set search_path='' as $$
declare v_row public.billing_intents;
begin
 if p_id is null or p_owner is null or p_price is null or p_live is null then raise exception 'Invalid checkout request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,194));
 select * into v_row from public.billing_intents where id=p_id;
 if found then
  if v_row.owner_id<>p_owner or v_row.price_id<>p_price or v_row.live<>p_live then raise exception 'Checkout request mismatch'; end if;
  if v_row.created_at < now()-interval '23 hours' then raise exception 'Checkout request expired'; end if;
  return v_row;
 end if;
 if (select count(*) from public.billing_intents where owner_id=p_owner and created_at>now()-interval '1 hour')>=3 then raise exception 'Checkout request limit reached'; end if;
 insert into public.billing_intents(id,owner_id,price_id,live) values(p_id,p_owner,p_price,p_live) returning * into v_row;
 return v_row;
end $$;
create function public.billing_bind_intent(p_id uuid,p_owner uuid,p_session text)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.billing_intents;
begin
 select * into v_row from public.billing_intents where id=p_id for update;
 if not found or v_row.owner_id is distinct from p_owner or p_session is null or length(p_session)=0 then raise exception 'Invalid checkout binding'; end if;
 if v_row.session_id is not null and v_row.session_id<>p_session then raise exception 'Checkout already bound'; end if;
 perform public.billing_record_checkout(p_owner,v_row.price_id,v_row.live,p_session,999,'usd');
 update public.billing_intents set session_id=p_session where id=p_id;
end $$;
create function public.billing_lookup_checkout(p_session text)
returns public.billing_checkouts language sql stable security definer set search_path='' as $$
 select c from public.billing_checkouts c where c.session_id=p_session
$$;
revoke all on function public.billing_begin_intent(uuid,uuid,text,boolean),public.billing_bind_intent(uuid,uuid,text),public.billing_lookup_checkout(text) from public,anon,authenticated;
grant execute on function public.billing_begin_intent(uuid,uuid,text,boolean),public.billing_bind_intent(uuid,uuid,text),public.billing_lookup_checkout(text) to service_role;

create function public.billing_get_entitlement(p_owner uuid)
returns table (paid_through timestamptz,is_pro boolean)
language sql stable security definer set search_path='' as $$
 select e.paid_through,coalesce(e.paid_through>now(),false)
 from (select p_owner as owner_id) o left join public.billing_entitlements e on e.owner_id=o.owner_id
$$;
revoke all on function public.billing_get_entitlement(uuid) from public,anon,authenticated;
grant execute on function public.billing_get_entitlement(uuid) to service_role;
