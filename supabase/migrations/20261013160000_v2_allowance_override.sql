-- V2 owner-approved Free allowances and a hard, server-authoritative provider budget.
-- Manual refreshes use a true rolling 24-hour window. Automatic refresh is claimed by
-- a server cron and stores a bounded owner-scoped result; it never depends on a browser.

create table public.job_refresh_events (
  owner_id uuid not null references auth.users(id) on delete cascade,
  reserved_at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('manual','automatic')),
  primary key(owner_id,reserved_at,kind)
);
create index job_refresh_events_owner_window_idx on public.job_refresh_events(owner_id,reserved_at desc);
alter table public.job_refresh_events enable row level security;
revoke all on table public.job_refresh_events from public,anon,authenticated;
grant select,insert,delete on table public.job_refresh_events to service_role;

create table public.job_provider_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('manual','automatic','pro_page_2')),
  requested_at timestamptz not null default clock_timestamp()
);
create index job_provider_requests_month_idx on public.job_provider_requests(requested_at);
alter table public.job_provider_requests enable row level security;
revoke all on table public.job_provider_requests from public,anon,authenticated;
grant select,insert on table public.job_provider_requests to service_role;

alter table public.job_preferences
  add column if not exists last_auto_refresh_at timestamptz,
  add column if not exists auto_refresh_lease_until timestamptz,
  add column if not exists auto_refresh_evidence jsonb,
  add constraint job_preferences_auto_evidence_bound check (auto_refresh_evidence is null or (jsonb_typeof(auto_refresh_evidence)='object' and octet_length(auto_refresh_evidence::text)<=100000));

create table public.job_auto_refresh_results (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  result jsonb,
  status text not null check (status in ('ready','no_results','provider_cap','failed')),
  refreshed_at timestamptz not null default now(),
  constraint job_auto_refresh_result_bound check (result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=1000000))
);
alter table public.job_auto_refresh_results enable row level security;
revoke all on table public.job_auto_refresh_results from public,anon,authenticated;
grant select,insert,update on table public.job_auto_refresh_results to service_role;

create or replace function public.jobs_reserve_recommendation_refresh(p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_is_pro boolean;v_now timestamptz:=clock_timestamp();v_count integer;v_oldest timestamptz;
begin
 if p_owner is null then raise exception 'Invalid job refresh' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,9137));
 select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
 if v_is_pro is null then raise exception 'Entitlement unavailable';end if;
 if v_is_pro then return jsonb_build_object('allowed',true,'isPro',true,'reservedAt',null,'previousRefreshAt',null,'nextRefreshAt',null);end if;
 select greatest(v_now,coalesce(max(reserved_at)+interval '1 microsecond',v_now)) into v_now
 from public.job_refresh_events where owner_id=p_owner and kind='manual';
 delete from public.job_refresh_events where owner_id=p_owner and reserved_at<=v_now-interval '24 hours';
 select count(*),min(reserved_at) into v_count,v_oldest from public.job_refresh_events where owner_id=p_owner and kind='manual';
 if v_count>=3 then return jsonb_build_object('allowed',false,'isPro',false,'reservedAt',null,'previousRefreshAt',v_oldest,'nextRefreshAt',v_oldest+interval '24 hours');end if;
 insert into public.job_refresh_events(owner_id,reserved_at,kind) values(p_owner,v_now,'manual');
 insert into public.job_preferences(owner_id,last_provider_refresh_at) values(p_owner,v_now)
 on conflict(owner_id) do update set last_provider_refresh_at=excluded.last_provider_refresh_at,updated_at=now();
 select min(reserved_at) into v_oldest from public.job_refresh_events where owner_id=p_owner and kind='manual';
 return jsonb_build_object('allowed',true,'isPro',false,'reservedAt',v_now,'previousRefreshAt',null,
  'nextRefreshAt',case when v_count+1>=3 then v_oldest+interval '24 hours' else null end);
end $$;

create or replace function public.jobs_release_recommendation_refresh(p_owner uuid,p_reserved_at timestamptz,p_previous_refresh_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_deleted integer;
begin
 if p_owner is null or p_reserved_at is null or not isfinite(p_reserved_at) then raise exception 'Invalid job refresh release' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,9137));
 delete from public.job_refresh_events where owner_id=p_owner and reserved_at=p_reserved_at and kind='manual';
 get diagnostics v_deleted=row_count;return v_deleted=1;
end $$;

create function public.jobs_reserve_provider_request(p_owner uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp();v_start timestamptz:=date_trunc('month',v_now at time zone 'UTC') at time zone 'UTC';v_used integer;v_latest timestamptz;
begin
 if p_kind not in ('manual','automatic','pro_page_2') then raise exception 'Invalid provider request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('job-provider-budget:'||to_char(v_start,'YYYY-MM'),7711));
 select count(*) into v_used from public.job_provider_requests where requested_at>=v_start and requested_at<v_start+interval '1 month';
 if v_used>=500 then return jsonb_build_object('allowed',false,'reason','cap','used',v_used,'remaining',0,'resetsAt',v_start+interval '1 month');end if;
 select max(requested_at) into v_latest from public.job_provider_requests;
 if v_latest is not null and v_latest>v_now-interval '1.1 seconds' then
  return jsonb_build_object('allowed',false,'reason','rate','used',v_used,'remaining',500-v_used,'retryAt',v_latest+interval '1.1 seconds','resetsAt',v_start+interval '1 month');
 end if;
 insert into public.job_provider_requests(owner_id,kind,requested_at) values(p_owner,p_kind,v_now);
 return jsonb_build_object('allowed',true,'used',v_used+1,'remaining',499-v_used,'resetsAt',v_start+interval '1 month');
end $$;

create function public.jobs_claim_auto_refresh(p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;
begin
 if p_limit<1 or p_limit>50 then raise exception 'Invalid claim limit';end if;
 with due as (
  select p.owner_id from public.job_preferences p left join public.resumes r on r.owner_id=p.owner_id
  where p.auto_refresh and p.criteria is not null
   and (p.auto_refresh_evidence is not null or r.id is not null)
   and (p.last_auto_refresh_at is null or p.last_auto_refresh_at<=now()-interval '24 hours')
   and (p.auto_refresh_lease_until is null or p.auto_refresh_lease_until<now())
  order by p.last_auto_refresh_at nulls first for update of p skip locked limit p_limit
 ), claimed as (
  update public.job_preferences p set auto_refresh_lease_until=now()+interval '10 minutes',updated_at=now()
  from due where p.owner_id=due.owner_id
  returning p.owner_id,p.criteria,p.auto_refresh_evidence,(select r.data from public.resumes r where r.owner_id=p.owner_id) resume
 ) select coalesce(jsonb_agg(jsonb_build_object('ownerId',owner_id,'criteria',criteria,'evidence',auto_refresh_evidence,'resume',resume)),'[]'::jsonb) into v_rows from claimed;
 return v_rows;
end $$;

create function public.jobs_finish_auto_refresh(p_owner uuid,p_status text,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('ready','no_results','provider_cap','failed') or (p_result is not null and (jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>1000000)) then raise exception 'Invalid auto refresh result';end if;
 insert into public.job_auto_refresh_results(owner_id,result,status,refreshed_at) values(p_owner,p_result,p_status,now())
 on conflict(owner_id) do update set result=excluded.result,status=excluded.status,refreshed_at=excluded.refreshed_at;
 update public.job_preferences set last_auto_refresh_at=case when p_status='failed' then last_auto_refresh_at else now() end,
  auto_refresh_lease_until=null,last_provider_refresh_at=case when p_status in ('ready','no_results') then now() else last_provider_refresh_at end,updated_at=now() where owner_id=p_owner;
 return found;
end $$;

create function public.jobs_auto_refresh_result(p_owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when a.owner_id is null then null else jsonb_build_object('status',a.status,'refreshedAt',a.refreshed_at,'result',a.result) end
 from (select p_owner owner_id) requested left join public.job_auto_refresh_results a on a.owner_id=requested.owner_id
$$;

revoke all on function public.jobs_reserve_provider_request(uuid,text),public.jobs_claim_auto_refresh(integer),public.jobs_finish_auto_refresh(uuid,text,jsonb),public.jobs_auto_refresh_result(uuid) from public,anon,authenticated;
grant execute on function public.jobs_reserve_provider_request(uuid,text),public.jobs_claim_auto_refresh(integer),public.jobs_finish_auto_refresh(uuid,text,jsonb),public.jobs_auto_refresh_result(uuid) to service_role;

create function public.jobs_set_preferences_v2(p_owner uuid,p_criteria jsonb,p_auto_refresh boolean,p_evidence jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null or p_auto_refresh is null or (p_criteria is not null and (jsonb_typeof(p_criteria)<>'object' or octet_length(p_criteria::text)>2000))
  or (p_auto_refresh and (p_evidence is null or jsonb_typeof(p_evidence)<>'object' or octet_length(p_evidence::text)>100000))
 then raise exception 'Invalid job preferences';end if;
 insert into public.job_preferences(owner_id,criteria,auto_refresh,auto_refresh_evidence)
 values(p_owner,p_criteria,p_auto_refresh,case when p_auto_refresh then p_evidence else null end)
 on conflict(owner_id) do update set criteria=excluded.criteria,auto_refresh=excluded.auto_refresh,
  auto_refresh_evidence=excluded.auto_refresh_evidence,updated_at=now();
 return true;
end $$;
revoke all on function public.jobs_set_preferences_v2(uuid,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.jobs_set_preferences_v2(uuid,jsonb,boolean,jsonb) to service_role;

-- Free successful exports are counted over a true rolling seven-day window. Existing
-- idempotency, leases, paid access and abuse limits remain unchanged.
create or replace function public.document_begin(p_id uuid,p_owner uuid,p_hash text,p_template text,p_premium_template boolean)
returns table(lease uuid,already_complete boolean)
language plpgsql security definer set search_path='' as $$
declare v_existing public.pdf_requests;v_limits public.pdf_owner_limits;v_signup timestamptz;v_cycle bigint;v_pro boolean;v_template boolean;v_paid boolean;v_lease uuid:=gen_random_uuid();v_cap integer;
begin
 if p_id is null or p_owner is null or p_hash is null or p_hash!~'^[a-f0-9]{64}$' or coalesce(length(trim(p_template)),0)=0 or p_premium_template is null then raise exception 'Invalid document request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,395));insert into public.pdf_owner_limits(owner_id) values(p_owner) on conflict do nothing;
 select * into v_limits from public.pdf_owner_limits where owner_id=p_owner for update;
 select a.is_pro,a.has_template into v_pro,v_template from public.billing_effective_access(p_owner,p_template) a;v_paid:=coalesce(v_pro,false) or coalesce(v_template,false);v_cap:=case when v_paid then 60 else 20 end;
 if p_premium_template and not v_paid then raise exception 'Premium template access required';end if;
 if v_limits.rate_window<=now()-interval '1 hour' then update public.pdf_owner_limits set rate_window=now(),attempts=0 where owner_id=p_owner;v_limits.attempts:=0;end if;
 if v_limits.attempts>=v_cap then raise exception 'Document request limit reached';end if;
 select * into v_existing from public.pdf_requests where id=p_id;
 if found then if v_existing.owner_id<>p_owner or v_existing.content_hash<>p_hash then raise exception 'Document request mismatch';end if;if v_existing.state='reserved' and v_existing.lease_until>now() then raise exception 'Document already generating';end if;if v_existing.state='complete' then update public.pdf_owner_limits set attempts=attempts+1 where owner_id=p_owner;return query select v_existing.lease,true;return;end if;end if;
 select created_at into v_signup from auth.users where id=p_owner;if v_signup is null or v_signup>now() then raise exception 'Account signup time unavailable';end if;v_cycle:=floor(extract(epoch from (now()-v_signup))/604800)::bigint;
 if not v_paid and (select count(*) from public.pdf_requests where owner_id=p_owner and counts_free and created_at>now()-interval '7 days' and (state='complete' or(state='reserved' and lease_until>now())))>=7 then raise exception 'Free document allowance reached';end if;
 insert into public.pdf_requests(id,owner_id,content_hash,cycle,counts_free,state,lease,lease_until) values(p_id,p_owner,p_hash,v_cycle,not v_paid,'reserved',v_lease,now()+interval '5 minutes')
 on conflict(id) do update set cycle=v_cycle,counts_free=not v_paid,state='reserved',lease=v_lease,lease_until=now()+interval '5 minutes';
 update public.pdf_owner_limits set attempts=attempts+1 where owner_id=p_owner;return query select v_lease,false;
end $$;

revoke all on function public.document_begin(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.document_begin(uuid,uuid,text,text,boolean) to service_role;

create or replace function public.pdf_status(p_owner uuid)
returns table(is_pro boolean,remaining integer,resets_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare v_count integer;v_pro boolean;v_oldest timestamptz;
begin
 select coalesce(paid_through>now(),false) into v_pro from public.billing_entitlements where owner_id=p_owner;
 select count(*)::integer,min(coalesce(completed_at,created_at)) into v_count,v_oldest from public.pdf_requests
 where owner_id=p_owner and counts_free and created_at>now()-interval '7 days'
  and (state='complete' or(state='reserved' and lease_until>now()));
 return query select coalesce(v_pro,false),greatest(0,7-v_count),
  case when v_count>=7 then v_oldest+interval '7 days' else now()+interval '7 days' end;
end $$;
revoke all on function public.pdf_status(uuid) from public,anon,authenticated;
grant execute on function public.pdf_status(uuid) to service_role;
