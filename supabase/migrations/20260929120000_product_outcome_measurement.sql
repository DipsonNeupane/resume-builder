-- Durable, owner-scoped and content-free product outcome measurement.
--
-- These tables intentionally store only relational identifiers, one-way bounded
-- identity keys, closed categories and timestamps. Resume text, job text, job
-- URLs and other user content never enter this measurement boundary.

alter table public.pdf_requests
  add column document_format text check (document_format is null or document_format in ('pdf','docx')),
  add column job_resume_version_id uuid;

create table public.product_match_results (
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_key text not null check (job_key ~ '^[0-9a-f]{64}$'),
  analysis_key text not null check (analysis_key ~ '^[0-9a-f]{64}$'),
  allowed_scope text not null check (allowed_scope in ('limited','full')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  primary key(owner_id,job_key,analysis_key)
);

create table public.product_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_key text not null check (job_key ~ '^[0-9a-f]{64}$'),
  analysis_key text not null check (analysis_key ~ '^[0-9a-f]{64}$'),
  review_scope text not null check (review_scope in ('limited','full')),
  first_reviewed_at timestamptz not null default now(),
  last_reviewed_at timestamptz not null default now(),
  limited_reviewed_at timestamptz,
  full_reviewed_at timestamptz,
  constraint product_evidence_review_timestamp check (
    limited_reviewed_at is not null or full_reviewed_at is not null
  ),
  unique(owner_id, job_key, analysis_key)
);
create index product_evidence_reviews_owner_job_idx
  on public.product_evidence_reviews(owner_id, job_key, last_reviewed_at desc);

create table public.application_package_conversions (
  export_request_id uuid primary key references public.pdf_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_resume_version_id uuid not null references public.job_resume_versions(id) on delete cascade,
  evidence_review_id uuid not null references public.product_evidence_reviews(id) on delete cascade,
  review_scope text not null check (review_scope in ('limited','full')),
  export_format text not null check (export_format in ('pdf','docx')),
  completed_at timestamptz not null,
  unique(owner_id, export_request_id)
);
create index application_package_conversions_owner_completed_idx
  on public.application_package_conversions(owner_id, completed_at desc);

alter table public.product_match_results enable row level security;
alter table public.product_evidence_reviews enable row level security;
alter table public.application_package_conversions enable row level security;
revoke all on table public.product_match_results, public.product_evidence_reviews, public.application_package_conversions
  from public, anon, authenticated, service_role;
grant select on table public.product_match_results, public.product_evidence_reviews, public.application_package_conversions
  to service_role;

-- Bind document scope on the first reservation. A completed master request can
-- therefore never be replayed later with a job-version identifier to manufacture
-- a conversion, even when the two documents happen to contain identical data.
create function public.product_begin_document(
  p_id uuid,
  p_owner uuid,
  p_hash text,
  p_template text,
  p_premium_template boolean,
  p_format text,
  p_job_resume_version uuid default null
) returns table(lease uuid,already_complete boolean)
language plpgsql security definer set search_path='' as $$
declare v_exists boolean; v_format text; v_version uuid;
begin
  if p_format not in ('pdf','docx') then raise exception 'Invalid document format'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,395));
  select true,document_format,job_resume_version_id into v_exists,v_format,v_version
    from public.pdf_requests where id=p_id;
  if coalesce(v_exists,false) and v_format is null and v_version is null and p_job_resume_version is null then
    update public.pdf_requests set document_format=p_format where id=p_id and owner_id=p_owner;
    v_format:=p_format;
  end if;
  if coalesce(v_exists,false) and (v_format is distinct from p_format or v_version is distinct from p_job_resume_version)
  then raise exception 'Document request context mismatch'; end if;
  return query select * from public.document_begin(p_id,p_owner,p_hash,p_template,p_premium_template);
  if not coalesce(v_exists,false) then
    update public.pdf_requests set document_format=p_format,job_resume_version_id=p_job_resume_version
      where id=p_id and owner_id=p_owner;
  end if;
end $$;

create function public.product_register_match_results(
  p_owner uuid,
  p_job_keys text[],
  p_analysis_keys text[],
  p_scope text
) returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if p_owner is null or p_scope not in ('limited','full') or p_job_keys is null or p_analysis_keys is null
    or cardinality(p_job_keys)>20 or cardinality(p_job_keys)<>cardinality(p_analysis_keys)
    or exists(select 1 from unnest(p_job_keys) as item(value) where item.value !~ '^[0-9a-f]{64}$')
    or exists(select 1 from unnest(p_analysis_keys) as item(value) where item.value !~ '^[0-9a-f]{64}$')
  then raise exception 'Invalid match results'; end if;
  insert into public.product_match_results(owner_id,job_key,analysis_key,allowed_scope)
  select p_owner,entry.job_key,entry.analysis_key,p_scope
    from unnest(p_job_keys,p_analysis_keys) entry(job_key,analysis_key)
  on conflict(owner_id,job_key,analysis_key) do update set
    allowed_scope=case when public.product_match_results.allowed_scope='full' or excluded.allowed_scope='full' then 'full' else 'limited' end,
    issued_at=now(),expires_at=now()+interval '7 days';
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create function public.product_record_evidence_review(
  p_owner uuid,
  p_job_key text,
  p_analysis_key text,
  p_scope text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_scope text; v_is_pro boolean; v_previous text;
begin
  if p_owner is null or p_job_key !~ '^[0-9a-f]{64}$'
    or p_analysis_key !~ '^[0-9a-f]{64}$' or p_scope not in ('limited','full')
  then raise exception 'Invalid evidence review'; end if;
  if not exists(
    select 1 from public.product_match_results r
     where r.owner_id=p_owner and r.job_key=p_job_key and r.analysis_key=p_analysis_key
       and r.expires_at>now() and (p_scope='limited' or r.allowed_scope='full')
  ) and not exists(
    select 1 from public.saved_jobs j
     where j.owner_id=p_owner and j.dedupe_key=p_job_key and j.match_context_hash=p_analysis_key
       and j.match_analysis is not null and j.match_invalidated_at is null
  ) then raise exception 'Evidence result unavailable'; end if;
  if p_scope='full' then
    select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
    if not coalesce(v_is_pro,false) then raise exception 'Full evidence review unavailable'; end if;
  end if;

  select review_scope into v_previous from public.product_evidence_reviews
    where owner_id=p_owner and job_key=p_job_key and analysis_key=p_analysis_key;

  insert into public.product_evidence_reviews(owner_id,job_key,analysis_key,review_scope,limited_reviewed_at,full_reviewed_at)
  values(p_owner,p_job_key,p_analysis_key,p_scope,
    case when p_scope='limited' then now() else null end,
    case when p_scope='full' then now() else null end)
  on conflict(owner_id,job_key,analysis_key) do update set
    review_scope=case
      when public.product_evidence_reviews.review_scope='full' or excluded.review_scope='full' then 'full'
      else 'limited'
    end,
    limited_reviewed_at=case when excluded.review_scope='limited' then coalesce(public.product_evidence_reviews.limited_reviewed_at,now()) else public.product_evidence_reviews.limited_reviewed_at end,
    full_reviewed_at=case when excluded.review_scope='full' then coalesce(public.product_evidence_reviews.full_reviewed_at,now()) else public.product_evidence_reviews.full_reviewed_at end,
    last_reviewed_at=now()
  returning review_scope into v_scope;
  return jsonb_build_object(
    'scope',v_scope,
    'newlyRecorded',v_previous is null or (v_previous='limited' and p_scope='full')
  );
end $$;

-- Called only after the document request is durably complete. The function
-- resolves job identity through the owner-owned version and chooses a prior
-- requirement-level review for that same job. It never reads browser ownership.
create function public.product_record_application_package(
  p_owner uuid,
  p_export_request uuid,
  p_job_resume_version uuid,
  p_format text
) returns text language plpgsql security definer set search_path='' as $$
declare
  v_completed_at timestamptz;
  v_job_key text;
  v_review public.product_evidence_reviews;
  v_existing text;
begin
  if p_owner is null or p_export_request is null or p_job_resume_version is null
    or p_format not in ('pdf','docx') then raise exception 'Invalid application package'; end if;

  select completed_at into v_completed_at from public.pdf_requests
   where id=p_export_request and owner_id=p_owner and state='complete'
     and document_format=p_format and job_resume_version_id=p_job_resume_version;
  if v_completed_at is null then return null; end if;

  select job_snapshot->>'dedupeKey' into v_job_key from public.job_resume_versions
   where id=p_job_resume_version and owner_id=p_owner;
  if v_job_key is null or v_job_key !~ '^[0-9a-f]{64}$' then return null; end if;

  select * into v_review from public.product_evidence_reviews
   where owner_id=p_owner and job_key=v_job_key
     and (limited_reviewed_at<=v_completed_at or full_reviewed_at<=v_completed_at)
   order by case when full_reviewed_at<=v_completed_at then 0 else 1 end, last_reviewed_at desc
   limit 1;
  if not found then return null; end if;

  insert into public.application_package_conversions(
    export_request_id,owner_id,job_resume_version_id,evidence_review_id,
    review_scope,export_format,completed_at
  ) values(
    p_export_request,p_owner,p_job_resume_version,v_review.id,
    case when v_review.full_reviewed_at<=v_completed_at then 'full' else 'limited' end,p_format,v_completed_at
  ) on conflict(export_request_id) do nothing;

  select review_scope into v_existing from public.application_package_conversions
   where export_request_id=p_export_request and owner_id=p_owner;
  return v_existing;
end $$;

-- Preserve the existing reservation semantics while making successful export
-- completion and an eligible north-star conversion one database transaction.
create function public.product_finish_document(
  p_id uuid,
  p_owner uuid,
  p_lease uuid,
  p_success boolean,
  p_format text,
  p_job_resume_version uuid default null
) returns text language plpgsql security definer set search_path='' as $$
declare v_scope text;
begin
  if p_format not in ('pdf','docx') then raise exception 'Invalid document format'; end if;
  if not exists(select 1 from public.pdf_requests where id=p_id and owner_id=p_owner
    and document_format=p_format and job_resume_version_id is not distinct from p_job_resume_version)
  then raise exception 'Document request context mismatch'; end if;
  perform public.pdf_finish(p_id,p_owner,p_lease,p_success);
  if p_success and p_job_resume_version is not null then
    v_scope := public.product_record_application_package(p_owner,p_id,p_job_resume_version,p_format);
  end if;
  return v_scope;
end $$;

revoke all on function public.product_begin_document(uuid,uuid,text,text,boolean,text,uuid),
  public.product_register_match_results(uuid,text[],text[],text),
  public.product_record_evidence_review(uuid,text,text,text),
  public.product_record_application_package(uuid,uuid,uuid,text),
  public.product_finish_document(uuid,uuid,uuid,boolean,text,uuid)
  from public,anon,authenticated;
grant execute on function public.product_begin_document(uuid,uuid,text,text,boolean,text,uuid),
  public.product_register_match_results(uuid,text[],text[],text),
  public.product_record_evidence_review(uuid,text,text,text),
  public.product_record_application_package(uuid,uuid,uuid,text),
  public.product_finish_document(uuid,uuid,uuid,boolean,text,uuid)
  to service_role;
