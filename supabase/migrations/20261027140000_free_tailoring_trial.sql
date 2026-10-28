-- One complete Free tailoring trial per account, enforced server-side.
--
-- A Free owner may prepare one job-specific resume (bound to one application) and run
-- a bounded number of AI suggestion requests for it. The trial is bound in the same
-- transaction that creates the version, so a failed creation consumes nothing. AI runs
-- count only after a successful provider response and are keyed by the AI request id,
-- so a retry of the same request never counts twice. Existing AI consent, budget and
-- usage accounting are unchanged; the trial only substitutes for the Pro gate.

alter table public.product_settings
  add column free_trial_ai_runs integer not null default 3 check (free_trial_ai_runs between 1 and 10);

create table public.product_tailoring_trials (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  saved_job_id uuid references public.saved_jobs(id) on delete set null,
  granted_at timestamptz not null default now()
);
create table public.product_tailoring_trial_runs (
  request_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now()
);
create index product_tailoring_trial_runs_owner_idx on public.product_tailoring_trial_runs(owner_id);
alter table public.product_tailoring_trials enable row level security;
alter table public.product_tailoring_trials force row level security;
alter table public.product_tailoring_trial_runs enable row level security;
alter table public.product_tailoring_trial_runs force row level security;
revoke all on table public.product_tailoring_trials, public.product_tailoring_trial_runs from public, anon, authenticated, service_role;
grant select on table public.product_tailoring_trials, public.product_tailoring_trial_runs to service_role;

-- Trial state for one owner, optionally for one application.
create function public.product_trial_status(p_owner uuid, p_saved_job uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_trial public.product_tailoring_trials; v_runs integer; v_allowed integer; v_trials integer;
begin
  select free_trial_ai_runs, free_tailoring_trials into v_allowed, v_trials from public.product_settings where id;
  select * into v_trial from public.product_tailoring_trials where owner_id = p_owner;
  select count(*)::integer into v_runs from public.product_tailoring_trial_runs where owner_id = p_owner;
  return jsonb_build_object(
    'enabled', v_trials > 0,
    'used', v_trial.owner_id is not null,
    'savedJobId', v_trial.saved_job_id,
    'runsRemaining', greatest(0, v_allowed - v_runs),
    'runsAllowed', v_allowed,
    'appliesToJob', p_saved_job is not null and v_trial.saved_job_id = p_saved_job and v_runs < v_allowed,
    'available', v_trials > 0 and (v_trial.owner_id is null or (p_saved_job is not null and v_trial.saved_job_id = p_saved_job and v_runs < v_allowed)));
end $$;

create function public.product_record_trial_run(p_owner uuid, p_saved_job uuid, p_request uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_owner is null or p_saved_job is null or p_request is null then raise exception 'Invalid trial run'; end if;
  if not exists(select 1 from public.product_tailoring_trials where owner_id = p_owner and saved_job_id = p_saved_job) then return false; end if;
  insert into public.product_tailoring_trial_runs(request_id, owner_id) values (p_request, p_owner) on conflict (request_id) do nothing;
  return found;
end $$;

-- Pro, or the owner's trial for this application, may start preparation.
create or replace function public.job_resume_version_create(p_owner uuid,p_saved_job uuid,p_data jsonb,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_is_pro boolean; v_job jsonb; v_master public.resumes; v_row public.job_resume_versions; v_stage text; v_revision integer;
  v_trial public.product_tailoring_trials; v_trials integer;
begin
  if p_owner is null or p_saved_job is null or p_data is null or jsonb_typeof(p_data)<>'object'
    or octet_length(p_data::text)>8000000 or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid job resume'; end if;
  select snapshot into v_job from public.saved_jobs where id=p_saved_job and owner_id=p_owner;
  if v_job is null then raise exception 'Saved job not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||p_saved_job::text,193));
  select * into v_row from public.job_resume_versions where owner_id=p_owner and saved_job_id=p_saved_job;
  if found then return jsonb_build_object('created',false,'version',to_jsonb(v_row)); end if;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if not coalesce(v_is_pro,false) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,194));
    select free_tailoring_trials into v_trials from public.product_settings where id;
    select * into v_trial from public.product_tailoring_trials where owner_id=p_owner;
    if coalesce(v_trials,0) < 1 or (v_trial.owner_id is not null and v_trial.saved_job_id is distinct from p_saved_job)
    then raise exception 'Active Pro required'; end if;
    if v_trial.owner_id is null then insert into public.product_tailoring_trials(owner_id, saved_job_id) values (p_owner, p_saved_job); end if;
  end if;
  select stage, revision into v_stage, v_revision from public.job_application_workflows where owner_id=p_owner and saved_job_id=p_saved_job;
  if v_stage = 'closed' then raise exception 'Application closed'; end if;
  if v_stage is null or v_stage = 'saved' then
    perform public.applications_apply(p_owner, p_saved_job, coalesce(v_revision,0), jsonb_build_object('stage','preparing'), 'user');
  end if;
  select * into v_master from public.resumes where owner_id=p_owner;
  insert into public.job_resume_versions(owner_id,saved_job_id,job_snapshot,source_master_resume_id,source_master_revision,source_master_fingerprint,data)
  values(p_owner,p_saved_job,v_job,v_master.id,v_master.revision,p_fingerprint,p_data) returning * into v_row;
  return jsonb_build_object('created',true,'version',to_jsonb(v_row));
end $$;

-- Tailoring inputs report trial eligibility alongside the unchanged Pro flag.
create or replace function public.job_tailoring_inputs(p_owner uuid,p_saved_job uuid,p_version uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_is_pro boolean;
begin
  if p_owner is null or p_saved_job is null or p_version is null then raise exception 'Invalid tailoring source'; end if;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  select jsonb_build_object(
    'versionId',v.id,'savedJobId',j.id,'resume',v.data,'job',j.snapshot,
    'matchAnalysis',case when j.match_invalidated_at is null then j.match_analysis else null end,
    'analysisCurrent',j.match_analysis is not null and j.match_invalidated_at is null,
    'isPro',v_is_pro,
    'trial',not v_is_pro and coalesce((public.product_trial_status(p_owner,p_saved_job)->>'appliesToJob')::boolean,false)
  ) into v_result
  from public.job_resume_versions v
  join public.saved_jobs j on j.id=v.saved_job_id and j.owner_id=v.owner_id
  where v.id=p_version and v.saved_job_id=p_saved_job and v.owner_id=p_owner;
  if v_result is null then raise exception 'Tailoring source not found'; end if;
  return v_result;
end $$;

-- Report trial availability with the account snapshot so the client can explain the
-- entitlement before the action.
create or replace function public.jobs_account_snapshot(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_is_pro boolean; v_result jsonb;
begin
  if p_owner is null then raise exception 'Invalid owner'; end if;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  update public.saved_jobs set provider_available=false,
    unavailable_at=coalesce(unavailable_at,now()), availability_checked_at=now(), updated_at=now()
    where owner_id=p_owner and provider_available and expires_at is not null and expires_at<=now();
  select jsonb_build_object('isPro',v_is_pro,'saveLimit',public.applications_owner_limit(p_owner),
    'savedCount',(select count(*) from public.saved_jobs where owner_id=p_owner),
    'tailoringTrial',case when v_is_pro then null else public.product_trial_status(p_owner,null) end,
    'preferences',coalesce((select jsonb_build_object('criteria',criteria,'autoRefresh',auto_refresh,
      'lastProviderRefreshAt',last_provider_refresh_at) from public.job_preferences where owner_id=p_owner),
      jsonb_build_object('criteria',null,'autoRefresh',false,'lastProviderRefreshAt',null)),
    'savedJobs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'snapshot',snapshot,
      'providerAvailable',provider_available,'availabilityCheckedAt',availability_checked_at,
      'unavailableAt',unavailable_at,'savedAt',saved_at) order by saved_at desc)
      from public.saved_jobs where owner_id=p_owner),'[]'::jsonb)) into v_result;
  return v_result;
end $$;

revoke all on function public.product_trial_status(uuid,uuid), public.product_record_trial_run(uuid,uuid,uuid),
  public.job_resume_version_create(uuid,uuid,jsonb,text), public.job_tailoring_inputs(uuid,uuid,uuid), public.jobs_account_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.product_trial_status(uuid,uuid), public.product_record_trial_run(uuid,uuid,uuid),
  public.job_resume_version_create(uuid,uuid,jsonb,text), public.job_tailoring_inputs(uuid,uuid,uuid), public.jobs_account_snapshot(uuid)
  to service_role;
