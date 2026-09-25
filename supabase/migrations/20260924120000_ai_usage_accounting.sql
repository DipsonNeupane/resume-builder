-- Additive AI usage accounting. Historical rows remain valid and are explicitly
-- labelled as legacy where the original ledger did not retain model/token data.
alter table public.ai_budget_requests
  add column feature text not null default 'tailoring',
  add column model text not null default 'legacy-unknown',
  add column provider_model text,
  add column status text not null default 'reserved',
  add column request_fingerprint text,
  add column input_tokens bigint,
  add column output_tokens bigint,
  add column actual_cost_micro_usd bigint,
  add column provider_response_id text,
  add column provider_request_id text,
  add column started_at timestamptz,
  add column completed_at timestamptz,
  add column reconciled_at timestamptz,
  add column reconciliation_disposition text,
  add column reconciliation_reference text;

update public.ai_budget_requests
set status = case when finished_at is null then 'uncertain' else 'succeeded' end,
    actual_cost_micro_usd = charged_micro_usd,
    completed_at = finished_at;

alter table public.ai_budget_requests
  add constraint ai_budget_requests_feature_format check (feature ~ '^[a-z][a-z0-9_]{0,39}$'),
  add constraint ai_budget_requests_model_length check (char_length(model) between 1 and 200),
  add constraint ai_budget_requests_provider_model_length check (provider_model is null or char_length(provider_model) between 1 and 200),
  add constraint ai_budget_requests_status_check check (status in ('reserved','in_progress','succeeded','failed','invalid','timed_out','uncertain')),
  add constraint ai_budget_requests_fingerprint_format check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint ai_budget_requests_token_counts check ((input_tokens is null or input_tokens >= 0) and (output_tokens is null or output_tokens >= 0)),
  add constraint ai_budget_requests_actual_cost check (actual_cost_micro_usd is null or actual_cost_micro_usd >= 0),
  -- Legacy finish_ai_budget callers know actual cost but did not retain tokens.
  -- New lifecycle callers always supply the complete three-value usage tuple.
  add constraint ai_budget_requests_usage_complete check (
    (input_tokens is null) = (output_tokens is null)
    and (input_tokens is null or actual_cost_micro_usd is not null)
  ),
  add constraint ai_budget_requests_provider_ids_length check ((provider_response_id is null or char_length(provider_response_id) between 1 and 200) and (provider_request_id is null or char_length(provider_request_id) between 1 and 200)),
  add constraint ai_budget_requests_reconciliation_check check (
    (reconciled_at is null and reconciliation_disposition is null and reconciliation_reference is null)
    or (reconciled_at is not null and reconciliation_disposition in ('confirmed_charged','confirmed_not_charged') and char_length(reconciliation_reference) between 1 and 500)
  );

create index ai_budget_requests_analysis
  on public.ai_budget_requests(feature, model, created_at);
create index ai_budget_requests_owner_analysis
  on public.ai_budget_requests(owner_id, feature, model, created_at);
create index ai_budget_requests_recent_fingerprint
  on public.ai_budget_requests(owner_id, request_fingerprint, created_at desc)
  where request_fingerprint is not null;

-- One transaction-scoped fingerprint lock makes the recent-duplicate check and
-- reservation atomic across tabs and server instances. The ten-minute window
-- prevents accidental duplicate spend without permanently preventing a user
-- from deliberately running the same request again later.
create function public.begin_ai_request(
  p_request uuid,
  p_owner uuid,
  p_max_micro_usd bigint,
  p_feature text,
  p_model text,
  p_request_fingerprint text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.ai_budget_requests%rowtype;
  v_reserved boolean;
begin
  if p_request is null or p_owner is null or p_max_micro_usd is null
    or p_feature is null or p_feature !~ '^[a-z][a-z0-9_]{0,39}$'
    or p_model is null or char_length(p_model) not between 1 and 200
    or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid AI reservation' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || p_request_fingerprint, 841));
  select * into v_existing from public.ai_budget_requests where request_id = p_request;
  if found then
    if v_existing.owner_id is distinct from p_owner
      or v_existing.reserved_micro_usd <> p_max_micro_usd
      or v_existing.feature <> p_feature
      or v_existing.model <> p_model
      or v_existing.request_fingerprint is distinct from p_request_fingerprint then
      raise exception 'AI request mismatch' using errcode = '22023';
    end if;
    return 'duplicate';
  end if;

  if exists (
    select 1 from public.ai_budget_requests
    where owner_id = p_owner
      and request_fingerprint = p_request_fingerprint
      and feature = p_feature
      and model = p_model
      and created_at > now() - interval '10 minutes'
  ) then
    return 'duplicate';
  end if;

  v_reserved := public.reserve_ai_budget(p_request, p_owner, p_max_micro_usd);
  if not v_reserved then return 'duplicate'; end if;
  update public.ai_budget_requests
  set feature = p_feature, model = p_model, request_fingerprint = p_request_fingerprint
  where request_id = p_request;
  return 'reserved';
end $$;

create function public.start_ai_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.ai_budget_requests%rowtype;
begin
  if p_request is null then raise exception 'Invalid AI request' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 293));
  select * into v_request from public.ai_budget_requests where request_id = p_request for update;
  if not found then raise exception 'Unknown AI request' using errcode = '22023'; end if;
  if v_request.status = 'in_progress' then return; end if;
  if v_request.status <> 'reserved' then raise exception 'AI request already completed' using errcode = '22023'; end if;
  update public.ai_budget_requests set status = 'in_progress', started_at = now() where request_id = p_request;
end $$;

-- Known usage settles the reservation to actual cost for both successful and
-- invalid application output: OpenAI still performed and billed the work.
-- Unknown outcomes retain the full reservation. No timer releases them.
create function public.finish_ai_request(
  p_request uuid,
  p_status text,
  p_input_tokens bigint default null,
  p_output_tokens bigint default null,
  p_actual_cost_micro_usd bigint default null,
  p_provider_model text default null,
  p_provider_response_id text default null,
  p_provider_request_id text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_request public.ai_budget_requests%rowtype;
  v_has_usage boolean := p_input_tokens is not null or p_output_tokens is not null or p_actual_cost_micro_usd is not null;
begin
  if p_request is null or p_status not in ('succeeded','failed','invalid','timed_out','uncertain')
    or (v_has_usage and (p_input_tokens is null or p_output_tokens is null or p_actual_cost_micro_usd is null))
    or (p_input_tokens is not null and p_input_tokens < 0)
    or (p_output_tokens is not null and p_output_tokens < 0)
    or (p_actual_cost_micro_usd is not null and p_actual_cost_micro_usd < 0)
    or (p_status = 'succeeded' and not v_has_usage)
    or (p_provider_model is not null and char_length(p_provider_model) not between 1 and 200)
    or (p_provider_response_id is not null and char_length(p_provider_response_id) not between 1 and 200)
    or (p_provider_request_id is not null and char_length(p_provider_request_id) not between 1 and 200) then
    raise exception 'Invalid AI outcome' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 293));
  select * into v_request from public.ai_budget_requests where request_id = p_request for update;
  if not found then raise exception 'Unknown AI request' using errcode = '22023'; end if;
  if v_request.status in ('succeeded','failed','invalid','timed_out','uncertain') then
    if v_request.status <> p_status
      or v_request.input_tokens is distinct from p_input_tokens
      or v_request.output_tokens is distinct from p_output_tokens
      or v_request.actual_cost_micro_usd is distinct from p_actual_cost_micro_usd then
      raise exception 'AI outcome mismatch' using errcode = '22023';
    end if;
    return;
  end if;
  if v_request.status <> 'in_progress' then raise exception 'AI request was not started' using errcode = '22023'; end if;

  if v_has_usage and p_actual_cost_micro_usd <= v_request.reserved_micro_usd then
    update public.ai_budget_months
      set reserved_micro_usd = reserved_micro_usd - v_request.reserved_micro_usd,
          spent_micro_usd = spent_micro_usd + p_actual_cost_micro_usd
      where month_start = v_request.month_start;
    update public.ai_budget_requests
      set charged_micro_usd = p_actual_cost_micro_usd, finished_at = now()
      where request_id = p_request;
  end if;

  update public.ai_budget_requests set
    status = p_status,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    actual_cost_micro_usd = p_actual_cost_micro_usd,
    provider_model = p_provider_model,
    provider_response_id = p_provider_response_id,
    provider_request_id = p_provider_request_id,
    completed_at = now()
  where request_id = p_request;
end $$;

-- Manual/service reconciliation requires external evidence. It is intentionally
-- never granted to browser roles and never runs automatically based on age.
create function public.reconcile_ai_request(
  p_request uuid,
  p_disposition text,
  p_reference text,
  p_input_tokens bigint default null,
  p_output_tokens bigint default null,
  p_actual_cost_micro_usd bigint default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.ai_budget_requests%rowtype;
begin
  if p_request is null or p_disposition not in ('confirmed_charged','confirmed_not_charged')
    or p_reference is null or char_length(p_reference) not between 1 and 500 then
    raise exception 'Invalid AI reconciliation' using errcode = '22023';
  end if;
  if p_disposition = 'confirmed_charged' and (p_input_tokens is null or p_input_tokens < 0 or p_output_tokens is null or p_output_tokens < 0 or p_actual_cost_micro_usd is null or p_actual_cost_micro_usd < 0) then
    raise exception 'Charged reconciliation requires usage' using errcode = '22023';
  end if;
  if p_disposition = 'confirmed_not_charged' and (p_input_tokens is not null or p_output_tokens is not null or p_actual_cost_micro_usd is not null) then
    raise exception 'No-charge reconciliation cannot include usage' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 293));
  select * into v_request from public.ai_budget_requests where request_id = p_request for update;
  if not found or v_request.status not in ('failed','invalid','timed_out','uncertain') or v_request.finished_at is not null or v_request.reconciled_at is not null then
    raise exception 'AI request is not reconcilable' using errcode = '22023';
  end if;
  if p_disposition = 'confirmed_charged' and p_actual_cost_micro_usd > v_request.reserved_micro_usd then
    raise exception 'AI charge exceeds reservation' using errcode = '22023';
  end if;

  update public.ai_budget_months
    set reserved_micro_usd = reserved_micro_usd - v_request.reserved_micro_usd,
        spent_micro_usd = spent_micro_usd + coalesce(p_actual_cost_micro_usd, 0)
    where month_start = v_request.month_start;
  update public.ai_budget_requests set
    input_tokens = coalesce(p_input_tokens, input_tokens),
    output_tokens = coalesce(p_output_tokens, output_tokens),
    actual_cost_micro_usd = case when p_disposition = 'confirmed_charged' then p_actual_cost_micro_usd else actual_cost_micro_usd end,
    charged_micro_usd = coalesce(p_actual_cost_micro_usd, 0),
    finished_at = now(),
    reconciled_at = now(),
    reconciliation_disposition = p_disposition,
    reconciliation_reference = p_reference
  where request_id = p_request;
end $$;

-- Preserve the original RPC for old server revisions while making legacy
-- settlements visible in the new status/cost fields.
create or replace function public.finish_ai_budget(p_request uuid, p_charged_micro_usd bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.ai_budget_requests%rowtype;
begin
  if p_request is null or p_charged_micro_usd is null or p_charged_micro_usd < 0 then
    raise exception 'Invalid AI charge' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 293));
  select * into v_request from public.ai_budget_requests where request_id=p_request for update;
  if not found then raise exception 'Unknown AI request' using errcode = '22023'; end if;
  if v_request.finished_at is not null then
    if v_request.charged_micro_usd <> p_charged_micro_usd then raise exception 'AI charge mismatch' using errcode = '22023'; end if;
    return;
  end if;
  if p_charged_micro_usd > v_request.reserved_micro_usd then raise exception 'AI charge exceeds reservation' using errcode = '22023'; end if;
  update public.ai_budget_months set reserved_micro_usd=reserved_micro_usd-v_request.reserved_micro_usd,
    spent_micro_usd=spent_micro_usd+p_charged_micro_usd where month_start=v_request.month_start;
  update public.ai_budget_requests set charged_micro_usd=p_charged_micro_usd,
    actual_cost_micro_usd=p_charged_micro_usd,status='succeeded',completed_at=now(),finished_at=now()
    where request_id=p_request;
end $$;

revoke all on function public.begin_ai_request(uuid,uuid,bigint,text,text,text),
  public.start_ai_request(uuid),
  public.finish_ai_request(uuid,text,bigint,bigint,bigint,text,text,text),
  public.reconcile_ai_request(uuid,text,text,bigint,bigint,bigint)
  from public, anon, authenticated;
grant execute on function public.begin_ai_request(uuid,uuid,bigint,text,text,text),
  public.start_ai_request(uuid),
  public.finish_ai_request(uuid,text,bigint,bigint,bigint,text,text,text),
  public.reconcile_ai_request(uuid,text,text,bigint,bigint,bigint)
  to service_role;
