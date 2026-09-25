-- Shared app-generated document allowance. The legacy pdf_* names are retained
-- for deployed database compatibility; PDF and DOCX exports both reserve here.
create table public.pdf_owner_limits (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 rate_window timestamptz not null default now(), attempts integer not null default 0
);
create table public.pdf_requests (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
 cycle bigint not null, counts_free boolean not null,
 state text not null check(state in ('reserved','complete','failed')),
 lease uuid not null, lease_until timestamptz not null,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create index pdf_requests_owner_cycle on public.pdf_requests(owner_id,cycle,state);
alter table public.pdf_requests enable row level security;
alter table public.pdf_owner_limits enable row level security;
revoke all on public.pdf_requests,public.pdf_owner_limits from public,anon,authenticated,service_role;

create function public.pdf_begin(p_id uuid,p_owner uuid,p_hash text)
returns table(lease uuid,already_complete boolean)
language plpgsql security definer set search_path='' as $$
declare v_existing public.pdf_requests; v_limits public.pdf_owner_limits; v_signup timestamptz;
 v_cycle bigint; v_pro boolean; v_lease uuid:=gen_random_uuid();
begin
 if p_id is null or p_owner is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid PDF request'; end if;
 -- Request ID lock first, owner lock next in all mutators.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,395));
 insert into public.pdf_owner_limits(owner_id) values(p_owner) on conflict do nothing;
 select * into v_limits from public.pdf_owner_limits where owner_id=p_owner for update;
 if v_limits.rate_window<=now()-interval '1 hour' then
  update public.pdf_owner_limits set rate_window=now(),attempts=0 where owner_id=p_owner;
  v_limits.attempts:=0;
 end if;
 if v_limits.attempts>=20 then raise exception 'PDF request limit reached'; end if;
 select * into v_existing from public.pdf_requests where id=p_id;
 if found then
  if v_existing.owner_id<>p_owner or v_existing.content_hash<>p_hash then raise exception 'PDF request mismatch'; end if;
  if v_existing.state='reserved' and v_existing.lease_until>now() then raise exception 'PDF already generating'; end if;
  if v_existing.state='complete' then
   update public.pdf_owner_limits set attempts=attempts+1 where owner_id=p_owner;
   return query select v_existing.lease,true; return;
  end if;
 end if;
 select created_at into v_signup from auth.users where id=p_owner;
 if v_signup is null or v_signup>now() then raise exception 'Account signup time unavailable'; end if;
 v_cycle:=floor(extract(epoch from (now()-v_signup))/2592000)::bigint;
 select coalesce(paid_through>now(),false) into v_pro from public.billing_entitlements where owner_id=p_owner;
 v_pro:=coalesce(v_pro,false);
 if not v_pro and (select count(*) from public.pdf_requests where owner_id=p_owner and cycle=v_cycle and counts_free
   and (state='complete' or (state='reserved' and lease_until>now())))>=3 then raise exception 'Free PDF allowance reached'; end if;
 insert into public.pdf_requests(id,owner_id,content_hash,cycle,counts_free,state,lease,lease_until)
 values(p_id,p_owner,p_hash,v_cycle,not v_pro,'reserved',v_lease,now()+interval '5 minutes')
 on conflict(id) do update set cycle=v_cycle,counts_free=not v_pro,state='reserved',lease=v_lease,lease_until=now()+interval '5 minutes';
 update public.pdf_owner_limits set attempts=attempts+1 where owner_id=p_owner;
 return query select v_lease,false;
end $$;
create function public.pdf_finish(p_id uuid,p_owner uuid,p_lease uuid,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.pdf_requests;
begin
 if p_success is null then raise exception 'Invalid PDF completion'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,395));
 select * into v_row from public.pdf_requests where id=p_id for update;
 if not found or v_row.owner_id is distinct from p_owner or v_row.lease is distinct from p_lease then raise exception 'PDF request mismatch'; end if;
 if v_row.state='complete' then return; end if;
 if v_row.state<>'reserved' or v_row.lease_until<=now() then raise exception 'PDF lease expired'; end if;
 update public.pdf_requests set state=case when p_success then 'complete' else 'failed' end,
 completed_at=case when p_success then now() else null end where id=p_id;
end $$;
revoke all on function public.pdf_begin(uuid,uuid,text),public.pdf_finish(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.pdf_begin(uuid,uuid,text),public.pdf_finish(uuid,uuid,uuid,boolean) to service_role;

create function public.pdf_status(p_owner uuid)
returns table(is_pro boolean,remaining integer,resets_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare v_signup timestamptz;v_cycle bigint;v_count integer;v_pro boolean;
begin
 select created_at into v_signup from auth.users where id=p_owner;
 if v_signup is null or v_signup>now() then raise exception 'Account signup time unavailable'; end if;
 v_cycle:=floor(extract(epoch from (now()-v_signup))/2592000)::bigint;
 select coalesce(paid_through>now(),false) into v_pro from public.billing_entitlements where owner_id=p_owner;
 select count(*)::integer into v_count from public.pdf_requests where owner_id=p_owner and cycle=v_cycle and counts_free
  and (state='complete' or(state='reserved' and lease_until>now()));
 return query select coalesce(v_pro,false),greatest(0,3-v_count),v_signup+((v_cycle+1)*2592000)*interval '1 second';
end $$;
revoke all on function public.pdf_status(uuid) from public,anon,authenticated;
grant execute on function public.pdf_status(uuid) to service_role;
