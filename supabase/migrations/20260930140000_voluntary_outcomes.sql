-- Voluntary, owner-scoped and content-free outcome reports.
--
-- These self-reports are deliberately separate from platform-observed records
-- such as product_evidence_reviews and application_package_conversions. They
-- contain no resume text, job text, job URL, notes, contact details or claim
-- that ResumeStride caused an interview or offer.
create table public.product_outcome_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  saved_job_id uuid not null references public.saved_jobs(id) on delete cascade,
  outcome text not null check (outcome in (
    'application_prepared','application_submitted','interview_received',
    'offer_received','declined','withdrawn'
  )),
  provenance text not null default 'self_reported' check (provenance = 'self_reported'),
  occurred_on date,
  time_saved_bucket text check (time_saved_bucket is null or time_saved_bucket in (
    'under_15_minutes','15_to_30_minutes','31_to_60_minutes','over_60_minutes','unsure'
  )),
  clarity_rating smallint check (clarity_rating is null or clarity_rating between 1 and 5),
  confidence_rating smallint check (confidence_rating is null or confidence_rating between 1 and 5),
  consent_version text not null check (consent_version = 'outcomes-v1'),
  consented_at timestamptz not null,
  methodology_version text not null default 'outcomes-v1' check (methodology_version = 'outcomes-v1'),
  first_reported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, saved_job_id, outcome),
  check (occurred_on is null or occurred_on <= current_date)
);

create index product_outcome_reports_owner_updated_idx
  on public.product_outcome_reports(owner_id, updated_at desc);

alter table public.product_outcome_reports enable row level security;
revoke all on table public.product_outcome_reports from public, anon, authenticated, service_role;
grant select on table public.product_outcome_reports to service_role;

create function public.product_outcome_reports_list(p_owner uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'savedJobId',saved_job_id,'outcome',outcome,'provenance',provenance,
    'occurredOn',occurred_on,'timeSavedBucket',time_saved_bucket,
    'clarityRating',clarity_rating,'confidenceRating',confidence_rating,
    'consentVersion',consent_version,'consentedAt',consented_at,
    'methodologyVersion',methodology_version,'reportedAt',first_reported_at,'updatedAt',updated_at
  ) order by updated_at desc),'[]'::jsonb)
  from public.product_outcome_reports where owner_id=p_owner
$$;

create function public.product_outcome_report(
  p_owner uuid,
  p_saved_job uuid,
  p_outcome text,
  p_occurred_on date,
  p_time_saved_bucket text,
  p_clarity_rating integer,
  p_confidence_rating integer,
  p_consent boolean,
  p_consent_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.product_outcome_reports;
begin
  if p_owner is null or p_saved_job is null
    or p_outcome not in ('application_prepared','application_submitted','interview_received','offer_received','declined','withdrawn')
    or p_consent is distinct from true or p_consent_version <> 'outcomes-v1'
    or (p_occurred_on is not null and p_occurred_on > current_date)
    or (p_time_saved_bucket is not null and p_time_saved_bucket not in ('under_15_minutes','15_to_30_minutes','31_to_60_minutes','over_60_minutes','unsure'))
    or (p_clarity_rating is not null and (p_clarity_rating < 1 or p_clarity_rating > 5))
    or (p_confidence_rating is not null and (p_confidence_rating < 1 or p_confidence_rating > 5))
  then raise exception 'Invalid outcome report'; end if;
  if not exists(select 1 from public.saved_jobs where id=p_saved_job and owner_id=p_owner)
  then raise exception 'Saved job not found'; end if;

  insert into public.product_outcome_reports(
    owner_id,saved_job_id,outcome,occurred_on,time_saved_bucket,
    clarity_rating,confidence_rating,consent_version,consented_at
  ) values (
    p_owner,p_saved_job,p_outcome,p_occurred_on,p_time_saved_bucket,
    p_clarity_rating,p_confidence_rating,p_consent_version,now()
  ) on conflict(owner_id,saved_job_id,outcome) do update set
    occurred_on=excluded.occurred_on,
    time_saved_bucket=excluded.time_saved_bucket,
    clarity_rating=excluded.clarity_rating,
    confidence_rating=excluded.confidence_rating,
    consent_version=excluded.consent_version,
    consented_at=now(),
    updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,'savedJobId',v_row.saved_job_id,'outcome',v_row.outcome,
    'provenance',v_row.provenance,'occurredOn',v_row.occurred_on,
    'timeSavedBucket',v_row.time_saved_bucket,'clarityRating',v_row.clarity_rating,
    'confidenceRating',v_row.confidence_rating,'consentVersion',v_row.consent_version,
    'consentedAt',v_row.consented_at,'methodologyVersion',v_row.methodology_version,
    'reportedAt',v_row.first_reported_at,'updatedAt',v_row.updated_at
  );
end $$;

revoke all on function public.product_outcome_reports_list(uuid),
  public.product_outcome_report(uuid,uuid,text,date,text,integer,integer,boolean,text)
  from public, anon, authenticated;
grant execute on function public.product_outcome_reports_list(uuid),
  public.product_outcome_report(uuid,uuid,text,date,text,integer,integer,boolean,text)
  to service_role;
