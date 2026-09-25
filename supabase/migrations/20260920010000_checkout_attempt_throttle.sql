-- Additive: closes the remaining edge documented in docs/PAYMENT_HANDLER_REVIEW.md —
-- removing the unnecessary catalog re-validation only reduced Stripe-call amplification
-- on the reuse path, it did not add any durable cap on how often checkout() itself may
-- run. A single authenticated account could still call POST /api/checkout in a loop
-- (against an existing bound intent, an existing unbound intent, or by minting a fresh
-- requestId once billing_begin_intent's own 3/hour creation limit is reached with a new
-- id each time) and force unbounded `sessions.retrieve` / `sessions.create` Stripe API
-- traffic under this app's shared key. This adds a separate, durable, per-owner
-- checkout-*attempt* throttle that the handler consults immediately before any Stripe
-- network call, regardless of whether the intent is new, unbound, or already bound to a
-- session — so retrying a bound or unbound intent is capped the same as minting new
-- ones. It does not touch billing_intents, its 3/hour creation limit, or any other
-- existing migration.
--
-- Storage is bounded to exactly one row per owner (a fixed-window counter that resets
-- itself once the hour elapses), not an ever-growing per-attempt ledger.
create table public.billing_checkout_attempts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0)
);
alter table public.billing_checkout_attempts enable row level security;
revoke all on public.billing_checkout_attempts from public, anon, authenticated, service_role;

create function public.billing_throttle_checkout_attempt(p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.billing_checkout_attempts%rowtype;
begin
  if p_owner is null then raise exception 'Invalid checkout attempt' using errcode = '22023'; end if;
  -- Serialize concurrent attempts from the same owner so a burst of parallel requests
  -- cannot all read the same pre-increment count and all pass.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 401));
  select * into v_row from public.billing_checkout_attempts where owner_id = p_owner for update;
  if not found then
    insert into public.billing_checkout_attempts(owner_id, window_start, attempt_count) values (p_owner, now(), 1);
    return;
  end if;
  if v_row.window_start < now() - interval '1 hour' then
    update public.billing_checkout_attempts set window_start = now(), attempt_count = 1 where owner_id = p_owner;
    return;
  end if;
  if v_row.attempt_count >= 20 then
    raise exception 'Too many checkout attempts. Wait up to an hour and try again.' using errcode = '54000';
  end if;
  update public.billing_checkout_attempts set attempt_count = attempt_count + 1 where owner_id = p_owner;
end $$;
revoke all on function public.billing_throttle_checkout_attempt(uuid) from public, anon, authenticated;
grant execute on function public.billing_throttle_checkout_attempt(uuid) to service_role;
