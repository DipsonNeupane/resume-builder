-- Registry-driven monthly Pro and per-template subscriptions.
-- Additive: legacy 30-day/manual-pass records remain readable and valid.

alter table public.billing_subscriptions
  add column if not exists offer_key text,
  add column if not exists offer_kind text,
  add column if not exists template_id text,
  add column if not exists current_period_start timestamptz;

alter table public.billing_subscriptions
  add constraint billing_subscriptions_offer_kind_known
  check (offer_kind is null or offer_kind in ('pro','template')),
  add constraint billing_subscriptions_template_shape
  check ((offer_kind = 'template' and template_id is not null and length(template_id) > 0)
      or (offer_kind is distinct from 'template' and template_id is null));

create unique index if not exists billing_subscriptions_offer_identity_idx
  on public.billing_subscriptions(owner_id, offer_key)
  where offer_key is not null and status in ('active','trialing','past_due','unpaid');

create table public.billing_subscription_grants (
  subscription_id text primary key references public.billing_subscriptions(subscription_id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  offer_key text not null,
  offer_kind text not null check (offer_kind in ('pro','template')),
  template_id text,
  invoice_id text not null unique,
  period_start timestamptz not null,
  period_end timestamptz not null,
  state text not null default 'active' check (state in ('active','reversed')),
  updated_at timestamptz not null default now(),
  check (period_end > period_start),
  check ((offer_kind = 'template' and template_id is not null and length(template_id) > 0)
      or (offer_kind = 'pro' and template_id is null))
);
create index billing_subscription_grants_owner_period_idx
  on public.billing_subscription_grants(owner_id, period_end desc);

create table public.billing_transactional_notices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  subscription_id text references public.billing_subscriptions(subscription_id) on delete cascade,
  kind text not null check (kind in ('purchase','renewal_reminder','renewal_receipt','cancellation','payment_failed','expiration','material_change','price_change')),
  due_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','sending','sent','failed','cancelled')),
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 8192),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index billing_transactional_notices_due_idx
  on public.billing_transactional_notices(state, due_at);

create table public.billing_offer_checkout_intents (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  offer_key text not null,
  price_id text not null,
  live boolean not null,
  session_id text unique,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index billing_offer_checkout_owner_idx on public.billing_offer_checkout_intents(owner_id,created_at desc);

create table public.billing_customers (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  live boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_subscription_grants enable row level security;
alter table public.billing_transactional_notices enable row level security;
alter table public.billing_offer_checkout_intents enable row level security;
alter table public.billing_customers enable row level security;
revoke all on public.billing_subscription_grants, public.billing_transactional_notices, public.billing_offer_checkout_intents
  from public, anon, authenticated, service_role;
revoke all on public.billing_customers from public, anon, authenticated, service_role;
grant select on public.billing_subscription_grants, public.billing_transactional_notices, public.billing_offer_checkout_intents to service_role;
grant select on public.billing_customers to service_role;

create or replace function public.billing_get_customer(p_owner uuid)
returns public.billing_customers language sql stable security definer set search_path='' as $$
 select c from public.billing_customers c where c.owner_id=p_owner
$$;

create or replace function public.billing_bind_customer(p_owner uuid,p_customer text,p_live boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_existing public.billing_customers;
begin
 if p_owner is null or p_customer !~ '^cus_[A-Za-z0-9]+$' or p_live is null then raise exception 'Invalid customer'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,579));
 select * into v_existing from public.billing_customers where owner_id=p_owner for update;
 if found and (v_existing.stripe_customer_id<>p_customer or v_existing.live<>p_live) then raise exception 'Customer identity mismatch'; end if;
 insert into public.billing_customers(owner_id,stripe_customer_id,live) values(p_owner,p_customer,p_live)
 on conflict(owner_id) do update set updated_at=now();
end $$;

create or replace function public.billing_begin_offer_checkout(p_id uuid,p_owner uuid,p_offer_key text,p_price text,p_live boolean)
returns public.billing_offer_checkout_intents language plpgsql security definer set search_path='' as $$
declare v_row public.billing_offer_checkout_intents;
begin
 if p_id is null or p_owner is null or coalesce(length(trim(p_offer_key)),0)=0 or coalesce(length(trim(p_price)),0)=0 or p_live is null then raise exception 'Invalid offer checkout';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,582));
 select * into v_row from public.billing_offer_checkout_intents where id=p_id;
 if found then
  if v_row.owner_id<>p_owner or v_row.offer_key<>p_offer_key or v_row.price_id<>p_price or v_row.live<>p_live then raise exception 'Offer checkout mismatch';end if;
  return v_row;
 end if;
 if exists(select 1 from public.billing_subscriptions where owner_id=p_owner and offer_key=p_offer_key and status in ('active','trialing','past_due','unpaid')) then raise exception 'Offer already subscribed';end if;
 if exists(select 1 from public.billing_subscription_grants g join public.billing_subscription_invoices i on i.invoice_id=g.invoice_id where g.owner_id=p_owner and g.offer_key=p_offer_key and g.period_end>now() and i.status='active') then raise exception 'Offer already subscribed';end if;
 if exists(select 1 from public.billing_offer_checkout_intents where owner_id=p_owner and completed_at is null and created_at>now()-interval '24 hours') then raise exception 'Offer checkout already pending';end if;
 if (select count(*) from public.billing_offer_checkout_intents where owner_id=p_owner and created_at>now()-interval '1 hour')>=10 then raise exception 'Offer checkout rate limit';end if;
 insert into public.billing_offer_checkout_intents(id,owner_id,offer_key,price_id,live) values(p_id,p_owner,p_offer_key,p_price,p_live) returning * into v_row;return v_row;
end $$;

create or replace function public.billing_complete_offer_checkout(p_session text)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.billing_offer_checkout_intents set completed_at=coalesce(completed_at,now()) where session_id=p_session;
 if not found then raise exception 'Offer checkout unavailable'; end if;
end $$;

create or replace function public.billing_bind_offer_checkout(p_id uuid,p_owner uuid,p_session text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(length(trim(p_session)),0)=0 then raise exception 'Invalid checkout session';end if;
 update public.billing_offer_checkout_intents set session_id=p_session where id=p_id and owner_id=p_owner and (session_id is null or session_id=p_session);
 if not found then raise exception 'Offer checkout binding mismatch';end if;
end $$;

create or replace function public.billing_lookup_offer_checkout(p_session text)
returns public.billing_offer_checkout_intents language sql stable security definer set search_path='' as $$
 select c from public.billing_offer_checkout_intents c where c.session_id=p_session
$$;

create or replace function public.billing_record_offer_subscription(
  p_owner uuid, p_subscription text, p_price text, p_live boolean, p_status text,
  p_cancel_at_period_end boolean, p_period_start timestamptz, p_period_end timestamptz,
  p_offer_key text, p_offer_kind text, p_template_id text
) returns void language plpgsql security definer set search_path='' as $$
declare v_existing public.billing_subscriptions;
begin
  if p_owner is null or coalesce(length(trim(p_subscription)),0)=0 or coalesce(length(trim(p_price)),0)=0
    or p_live is null or p_status not in ('active','past_due','canceled','incomplete','incomplete_expired','paused','trialing','unpaid')
    or p_cancel_at_period_end is null or p_period_start is null or p_period_end is null or p_period_end<=p_period_start
    or coalesce(length(trim(p_offer_key)),0)=0 or p_offer_kind not in ('pro','template')
    or (p_offer_kind='template' and coalesce(length(trim(p_template_id)),0)=0)
    or (p_offer_kind='pro' and p_template_id is not null)
  then raise exception 'Invalid offer subscription'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_offer_key, 581));
  select * into v_existing from public.billing_subscriptions where subscription_id=p_subscription for update;
  if found and (v_existing.owner_id<>p_owner or v_existing.price_id<>p_price or v_existing.live<>p_live
    or v_existing.offer_key is distinct from p_offer_key or v_existing.offer_kind is distinct from p_offer_kind
    or v_existing.template_id is distinct from p_template_id)
  then raise exception 'Subscription identity mismatch'; end if;
  insert into public.billing_subscriptions(subscription_id,owner_id,price_id,live,status,cancel_at_period_end,current_period_start,current_period_end,offer_key,offer_kind,template_id)
  values(p_subscription,p_owner,p_price,p_live,p_status,p_cancel_at_period_end,p_period_start,p_period_end,p_offer_key,p_offer_kind,p_template_id)
  on conflict(subscription_id) do update set status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,
    current_period_start=least(coalesce(public.billing_subscriptions.current_period_start,excluded.current_period_start),excluded.current_period_start),
    current_period_end=greatest(coalesce(public.billing_subscriptions.current_period_end,excluded.current_period_end),excluded.current_period_end),updated_at=now();
exception when unique_violation then
  raise exception 'An in-force subscription already exists for this offer';
end $$;

create or replace function public.billing_apply_offer_invoice(
  p_subscription text,p_invoice text,p_owner uuid,p_payment_intent text,p_price text,p_live boolean,
  p_amount bigint,p_currency text,p_period_start timestamptz,p_period_end timestamptz,p_verified_at timestamptz
) returns void language plpgsql security definer set search_path='' as $$
declare v_sub public.billing_subscriptions; v_existing public.billing_subscription_invoices;
begin
  if coalesce(length(trim(p_subscription)),0)=0 or coalesce(length(trim(p_invoice)),0)=0 or coalesce(length(trim(p_payment_intent)),0)=0 or p_owner is null
    or coalesce(length(trim(p_price)),0)=0 or p_live is null or p_amount<=0 or lower(p_currency)<>p_currency or length(p_currency)<>3
    or p_period_start is null or p_period_end is null or p_period_end<=p_period_start or p_verified_at is null or p_verified_at>now()+interval '5 minutes'
  then raise exception 'Invalid offer invoice'; end if;
  select * into v_sub from public.billing_subscriptions where subscription_id=p_subscription for update;
  if not found or v_sub.owner_id<>p_owner or v_sub.price_id<>p_price or v_sub.live<>p_live or v_sub.offer_key is null
  then raise exception 'Offer invoice identity mismatch'; end if;
  select * into v_existing from public.billing_subscription_invoices where invoice_id=p_invoice;
  if found then
    if v_existing.subscription_id<>p_subscription or v_existing.owner_id<>p_owner or v_existing.payment_intent_id is distinct from p_payment_intent or v_existing.amount_paid<>p_amount
      or v_existing.currency<>p_currency or v_existing.period_start<>p_period_start or v_existing.period_end<>p_period_end
    then raise exception 'Invoice replay mismatch'; end if;
    return;
  end if;
  insert into public.billing_subscription_invoices(invoice_id,subscription_id,owner_id,outcome,amount_paid,currency,period_start,period_end,verified_at,granted_paid_through,payment_intent_id)
  values(p_invoice,p_subscription,p_owner,'granted',p_amount,p_currency,p_period_start,p_period_end,p_verified_at,p_period_end,p_payment_intent);
  insert into public.billing_subscription_grants(subscription_id,owner_id,offer_key,offer_kind,template_id,invoice_id,period_start,period_end,state)
  values(p_subscription,p_owner,v_sub.offer_key,v_sub.offer_kind,v_sub.template_id,p_invoice,p_period_start,p_period_end,'active')
  on conflict(subscription_id) do update set invoice_id=case when excluded.period_end>=public.billing_subscription_grants.period_end then excluded.invoice_id else public.billing_subscription_grants.invoice_id end,
    period_start=least(public.billing_subscription_grants.period_start,excluded.period_start),
    period_end=greatest(public.billing_subscription_grants.period_end,excluded.period_end),state='active',updated_at=now();
  -- The shared, payment-network reversal ledger locks the owner's entitlement
  -- row before it voids an invoice. Template-only customers are deliberately
  -- not Pro, but still need that nullable ledger anchor so a refund or dispute
  -- can revoke their template grant safely and idempotently.
  insert into public.billing_entitlements(owner_id,paid_through) values(p_owner,null)
  on conflict(owner_id) do nothing;
  update public.billing_subscriptions set status='active',current_period_start=p_period_start,
    current_period_end=greatest(coalesce(current_period_end,p_period_end),p_period_end),updated_at=now()
    where subscription_id=p_subscription;
  if v_sub.offer_kind='pro' then
    insert into public.billing_entitlements(owner_id,paid_through) values(p_owner,p_period_end)
    on conflict(owner_id) do update set paid_through=greatest(public.billing_entitlements.paid_through,excluded.paid_through),updated_at=now();
  end if;
end $$;

create or replace function public.billing_update_offer_subscription(
 p_subscription text,p_owner uuid,p_status text,p_cancel_at_period_end boolean,p_period_end timestamptz
) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null or coalesce(length(trim(p_subscription)),0)=0
   or p_status not in ('active','past_due','canceled','incomplete','incomplete_expired','paused','trialing','unpaid')
   or p_cancel_at_period_end is null then raise exception 'Invalid subscription update'; end if;
 update public.billing_subscriptions set status=p_status,cancel_at_period_end=p_cancel_at_period_end,
   current_period_end=greatest(coalesce(current_period_end,p_period_end),p_period_end),updated_at=now()
 where subscription_id=p_subscription and owner_id=p_owner;
 if not found then raise exception 'Subscription owner mismatch'; end if;
 if p_cancel_at_period_end or p_status in ('canceled','incomplete_expired') then
   update public.billing_transactional_notices set state='cancelled',updated_at=now()
   where subscription_id=p_subscription and kind='renewal_reminder' and state='pending';
 end if;
end $$;

create or replace function public.billing_owner_subscription_summary(p_owner uuid)
returns table(subscription_id text,offer_key text,offer_kind text,template_id text,status text,cancel_at_period_end boolean,current_period_end timestamptz)
language sql stable security definer set search_path='' as $$
 select s.subscription_id,s.offer_key,s.offer_kind,s.template_id,s.status,s.cancel_at_period_end,s.current_period_end
 from public.billing_subscriptions s where s.owner_id=p_owner and s.offer_key is not null order by s.created_at
$$;

create or replace function public.billing_owner_template_access(p_owner uuid)
returns table(template_id text,period_end timestamptz) language sql stable security definer set search_path='' as $$
 select g.template_id,g.period_end from public.billing_subscription_grants g
 join public.billing_subscription_invoices i on i.invoice_id=g.invoice_id
 where g.owner_id=p_owner and g.offer_kind='template' and g.period_end>now() and g.state='active' and i.status='active'
$$;

create or replace function public.billing_effective_access(p_owner uuid,p_template text)
returns table(is_pro boolean,has_template boolean) language sql stable security definer set search_path='' as $$
 select
   (coalesce((select e.paid_through>now() from public.billing_entitlements e where e.owner_id=p_owner),false)
    or exists(select 1 from public.billing_subscription_grants g join public.billing_subscription_invoices i on i.invoice_id=g.invoice_id where g.owner_id=p_owner and g.offer_kind='pro' and g.state='active' and i.status='active' and g.period_end>now())),
   exists(select 1 from public.billing_subscription_grants g join public.billing_subscription_invoices i on i.invoice_id=g.invoice_id where g.owner_id=p_owner and g.offer_kind='template' and g.template_id=p_template and g.state='active' and i.status='active' and g.period_end>now())
$$;

-- Keep cloud resume persistence aligned with the same explicit 27-template allowlist.
create or replace function public.resume_data_is_valid(data jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(data)='object'
  and jsonb_typeof(data->'version')='number' and (data->>'version')='1'
  and public.resume_strings_ok(data,array['name','headline','email','phone','location','website','summary','skills'],50000)
  and public.resume_strings_ok(data,array['profileHeading','skillsHeading'],200)
  and (data->>'template') in ('modern','classic','minimal','compact','bold','executive','ledger','boardroom','mandate','stackline','kernel','casebook','atelier','scholar','bench','charter','rounds','meridian','crossover','almanac','roster','primer','pyramid','quartile','waypoint','cadence','plainsong')
  and (data->>'paper') in ('A4','Letter') and (data->>'direction') in ('ltr','rtl')
  and (data->>'accent')~'^#[0-9a-fA-F]{6}$' and (data->>'language')~'^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$'
  and (data->'noExperience' is null or jsonb_typeof(data->'noExperience')='boolean')
  and case when jsonb_typeof(data->'sections')='array' then jsonb_array_length(data->'sections')<=30 and public.resume_sections_ok(data->'sections') else false end
$$;

create or replace function public.billing_enqueue_notice(
 p_owner uuid,p_subscription text,p_kind text,p_due_at timestamptz,p_dedupe_key text,p_payload jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null or p_kind not in ('purchase','renewal_reminder','renewal_receipt','cancellation','payment_failed','expiration','material_change','price_change')
   or p_due_at is null or coalesce(length(trim(p_dedupe_key)),0)=0 or p_payload is null or pg_column_size(p_payload)>8192
 then raise exception 'Invalid transactional notice'; end if;
 insert into public.billing_transactional_notices(owner_id,subscription_id,kind,due_at,dedupe_key,payload)
 values(p_owner,p_subscription,p_kind,p_due_at,p_dedupe_key,p_payload) on conflict(dedupe_key) do nothing;
end $$;

create or replace function public.billing_schedule_renewal_notices(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 insert into public.billing_transactional_notices(owner_id,subscription_id,kind,due_at,dedupe_key,payload)
 select s.owner_id,s.subscription_id,'renewal_reminder',s.current_period_end-interval '3 days',
   'renewal-reminder:'||s.subscription_id||':'||extract(epoch from s.current_period_end)::bigint,
   jsonb_build_object('offerKey',s.offer_key,'renewsAt',s.current_period_end)
 from public.billing_subscriptions s
 where s.offer_key is not null and s.status in ('active','trialing') and not s.cancel_at_period_end
   and s.current_period_end is not null and s.current_period_end>p_now
 on conflict(dedupe_key) do nothing;
 get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.billing_claim_due_notices(p_limit integer default 25)
returns setof public.billing_transactional_notices language plpgsql security definer set search_path='' as $$
begin
 if p_limit<1 or p_limit>100 then raise exception 'Invalid notice claim size'; end if;
 return query
 with due as (
   select n.id from public.billing_transactional_notices n
   where (n.state='pending' or (n.state='sending' and n.updated_at<now()-interval '15 minutes')) and n.due_at<=now()
   order by n.due_at for update skip locked limit p_limit
 )
 update public.billing_transactional_notices n set state='sending',attempt_count=attempt_count+1,updated_at=now()
 from due where n.id=due.id returning n.*;
end $$;

create or replace function public.billing_finish_notice(p_id uuid,p_success boolean,p_provider_id text,p_error_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.billing_transactional_notices set state=case when p_success then 'sent' when attempt_count<5 then 'pending' else 'failed' end,
   provider_message_id=case when p_success then nullif(p_provider_id,'') else provider_message_id end,
   last_error_code=case when p_success then null else left(coalesce(p_error_code,'provider_failure'),80) end,
   sent_at=case when p_success then now() else sent_at end,
   due_at=case when p_success then due_at else now()+make_interval(mins=>least(60,attempt_count*5)) end,updated_at=now()
 where id=p_id and state='sending';
 if not found then raise exception 'Notice claim unavailable'; end if;
end $$;

-- Existing reservation accounting with paid template access and a larger paid fair-use ceiling.
create or replace function public.document_begin(p_id uuid,p_owner uuid,p_hash text,p_template text,p_premium_template boolean)
returns table(lease uuid,already_complete boolean)
language plpgsql security definer set search_path='' as $$
declare v_existing public.pdf_requests;v_limits public.pdf_owner_limits;v_signup timestamptz;
 v_cycle bigint;v_pro boolean;v_template boolean;v_paid boolean;v_lease uuid:=gen_random_uuid();v_cap integer;
begin
 if p_id is null or p_owner is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or coalesce(length(trim(p_template)),0)=0 or p_premium_template is null then raise exception 'Invalid document request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,395));
 insert into public.pdf_owner_limits(owner_id) values(p_owner) on conflict do nothing;
 select * into v_limits from public.pdf_owner_limits where owner_id=p_owner for update;
 select a.is_pro,a.has_template into v_pro,v_template from public.billing_effective_access(p_owner,p_template) a;
 v_paid:=coalesce(v_pro,false) or coalesce(v_template,false);v_cap:=case when v_paid then 60 else 20 end;
 if p_premium_template and not v_paid then raise exception 'Premium template access required'; end if;
 if v_limits.rate_window<=now()-interval '1 hour' then update public.pdf_owner_limits set rate_window=now(),attempts=0 where owner_id=p_owner;v_limits.attempts:=0;end if;
 if v_limits.attempts>=v_cap then raise exception 'Document request limit reached';end if;
 select * into v_existing from public.pdf_requests where id=p_id;
 if found then
  if v_existing.owner_id<>p_owner or v_existing.content_hash<>p_hash then raise exception 'Document request mismatch';end if;
  if v_existing.state='reserved' and v_existing.lease_until>now() then raise exception 'Document already generating';end if;
  if v_existing.state='complete' then update public.pdf_owner_limits set attempts=attempts+1 where owner_id=p_owner;return query select v_existing.lease,true;return;end if;
 end if;
 select created_at into v_signup from auth.users where id=p_owner;if v_signup is null or v_signup>now() then raise exception 'Account signup time unavailable';end if;
 v_cycle:=floor(extract(epoch from (now()-v_signup))/2592000)::bigint;
 if not v_paid and (select count(*) from public.pdf_requests where owner_id=p_owner and cycle=v_cycle and counts_free and (state='complete' or(state='reserved' and lease_until>now())))>=3 then raise exception 'Free document allowance reached';end if;
 insert into public.pdf_requests(id,owner_id,content_hash,cycle,counts_free,state,lease,lease_until)
 values(p_id,p_owner,p_hash,v_cycle,not v_paid,'reserved',v_lease,now()+interval '5 minutes')
 on conflict(id) do update set cycle=v_cycle,counts_free=not v_paid,state='reserved',lease=v_lease,lease_until=now()+interval '5 minutes';
 update public.pdf_owner_limits set attempts=attempts+1 where owner_id=p_owner;return query select v_lease,false;
end $$;

revoke execute on function public.billing_record_offer_subscription(uuid,text,text,boolean,text,boolean,timestamptz,timestamptz,text,text,text),
 public.billing_apply_offer_invoice(text,text,uuid,text,text,boolean,bigint,text,timestamptz,timestamptz,timestamptz),
 public.billing_update_offer_subscription(text,uuid,text,boolean,timestamptz),public.billing_owner_subscription_summary(uuid),
 public.billing_effective_access(uuid,text),public.billing_enqueue_notice(uuid,text,text,timestamptz,text,jsonb),
 public.document_begin(uuid,uuid,text,text,boolean),public.billing_begin_offer_checkout(uuid,uuid,text,text,boolean),
 public.billing_bind_offer_checkout(uuid,uuid,text),public.billing_lookup_offer_checkout(text),
 public.billing_complete_offer_checkout(text),public.billing_owner_template_access(uuid),
 public.billing_get_customer(uuid),public.billing_bind_customer(uuid,text,boolean),
 public.billing_schedule_renewal_notices(timestamptz),public.billing_claim_due_notices(integer),
 public.billing_finish_notice(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.billing_record_offer_subscription(uuid,text,text,boolean,text,boolean,timestamptz,timestamptz,text,text,text),
 public.billing_apply_offer_invoice(text,text,uuid,text,text,boolean,bigint,text,timestamptz,timestamptz,timestamptz),
 public.billing_update_offer_subscription(text,uuid,text,boolean,timestamptz),public.billing_owner_subscription_summary(uuid),
 public.billing_effective_access(uuid,text),public.billing_enqueue_notice(uuid,text,text,timestamptz,text,jsonb),
 public.document_begin(uuid,uuid,text,text,boolean),public.billing_begin_offer_checkout(uuid,uuid,text,text,boolean),
 public.billing_bind_offer_checkout(uuid,uuid,text),public.billing_lookup_offer_checkout(text),
 public.billing_complete_offer_checkout(text),public.billing_owner_template_access(uuid),
 public.billing_get_customer(uuid),public.billing_bind_customer(uuid,text,boolean),
 public.billing_schedule_renewal_notices(timestamptz),public.billing_claim_due_notices(integer),
 public.billing_finish_notice(uuid,boolean,text,text) to service_role;
