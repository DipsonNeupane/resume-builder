-- Monetary values are integer micro-US dollars ($25 = 25,000,000).
-- Reserve the provider's worst-case request cost BEFORE sending it. Uncertain
-- provider outcomes retain their reservation; a timeout is not proof of no charge.
create table public.ai_budget_months (
  month_start date primary key,
  reserved_micro_usd bigint not null default 0 check (reserved_micro_usd >= 0),
  spent_micro_usd bigint not null default 0 check (spent_micro_usd >= 0),
  check (reserved_micro_usd + spent_micro_usd <= 25000000)
);
create table public.ai_budget_requests (
  request_id uuid primary key,
  owner_id uuid references auth.users(id) on delete set null,
  month_start date not null references public.ai_budget_months(month_start),
  reserved_micro_usd bigint not null check (reserved_micro_usd between 1 and 1000000),
  charged_micro_usd bigint check (charged_micro_usd >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((finished_at is null) = (charged_micro_usd is null)),
  check (charged_micro_usd <= reserved_micro_usd)
);
create index ai_budget_requests_owner_created on public.ai_budget_requests(owner_id, created_at);
alter table public.ai_budget_months enable row level security;
alter table public.ai_budget_requests enable row level security;
revoke all on public.ai_budget_months, public.ai_budget_requests from public, anon, authenticated;

create function public.reserve_ai_budget(p_request uuid, p_owner uuid, p_max_micro_usd bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', timezone('UTC', now()))::date;
  v_request public.ai_budget_requests%rowtype;
  v_budget public.ai_budget_months%rowtype;
begin
  if p_request is null or p_owner is null or p_max_micro_usd is null or p_max_micro_usd not between 1 and 1000000 then
    raise exception 'Invalid AI reservation' using errcode = '22023';
  end if;
  -- Serialize replay IDs even across a month rollover.
  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 293));
  select * into v_request from public.ai_budget_requests where request_id = p_request;
  if found then
    if v_request.owner_id is distinct from p_owner or v_request.reserved_micro_usd <> p_max_micro_usd then
      raise exception 'AI request mismatch' using errcode = '22023';
    end if;
    -- Replayed/uncertain requests NEVER authorize a second provider call.
    return false;
  end if;
  insert into public.ai_budget_months(month_start) values(v_month) on conflict do nothing;
  select * into v_budget from public.ai_budget_months where month_start = v_month for update;
  if v_budget.reserved_micro_usd + v_budget.spent_micro_usd + p_max_micro_usd > 25000000 then
    raise exception 'AI monthly budget reached' using errcode = '54000';
  end if;
  -- Per-account abuse guard, serialized under the shared month lock.
  if (select count(*) from public.ai_budget_requests where owner_id=p_owner and created_at > now()-interval '1 hour') >= 20 then
    raise exception 'AI request limit reached' using errcode = '54000';
  end if;
  insert into public.ai_budget_requests(request_id,owner_id,month_start,reserved_micro_usd)
    values(p_request,p_owner,v_month,p_max_micro_usd);
  update public.ai_budget_months set reserved_micro_usd=reserved_micro_usd+p_max_micro_usd where month_start=v_month;
  return true;
end $$;

create function public.finish_ai_budget(p_request uuid, p_charged_micro_usd bigint)
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
  update public.ai_budget_requests set charged_micro_usd=p_charged_micro_usd,finished_at=now() where request_id=p_request;
end $$;
revoke all on function public.reserve_ai_budget(uuid,uuid,bigint), public.finish_ai_budget(uuid,bigint) from public, anon, authenticated;
grant execute on function public.reserve_ai_budget(uuid,uuid,bigint), public.finish_ai_budget(uuid,bigint) to service_role;
