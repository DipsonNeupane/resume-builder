-- ResumeStride: a single, durable, per-owner checkout reservation shared by
-- BOTH the one-time manual pass and the OPTIONAL recurring subscription
-- checkout flows. See docs/CHECKOUT_RESERVATION_DESIGN.md for the full
-- design and server/billing/reservation.ts / server/billing/handlers.ts for
-- the callers.
--
-- ADDITIVE ONLY. Does not alter 20260919211000_checkout_intents.sql or
-- 20260920040000_recurring_checkout.sql. Those two tables' own
-- billing_begin_intent/billing_begin_subscription_intent (advisory-lock keys
-- 194/196) still provide per-request-id idempotency and the existing 3/hour
-- creation cap for their own flow; this migration adds a SEPARATE outer gate
-- that both flows must acquire before either one may proceed, because those
-- two existing locks use different, independent advisory-lock namespaces and
-- therefore never serialize against each other. A manual checkout() and a
-- subscribeCheckout() call for the SAME owner (or two subscribeCheckout()
-- calls with two different request ids, i.e. two browser tabs) could
-- previously both pass their own separate "do I already have an active
-- subscription / prepaid pass" preflight check before either one committed
-- anything durable, then both go on to create their own real, independently
-- payable Stripe Checkout Session. This migration closes that race.
--
-- One row per owner (owner_id is the primary key) represents "this owner has
-- exactly one checkout in flight right now, and it is this one" — regardless
-- of whether that in-flight checkout is the manual pass or the subscription.
-- The row is released ONLY:
--   (a) when the server has re-retrieved the actual Stripe Checkout Session
--       (or, for a subscription, the resulting Subscription record) and
--       confirmed a PROVIDER-CONFIRMED terminal outcome for it — paid/
--       subscribed (webhook.session.completed, reconciled) or expired
--       (webhook checkout.session.expired, Stripe's own terminal signal for
--       an abandoned session) — never on a local guess about elapsed time;
--       Stripe's default Checkout Session expiry window is up to 24 hours
--       and is configurable per session, so a fixed local TTL could still
--       release a reservation while the actual Stripe session remains open
--       and payable, letting a second checkout start alongside it; or
--   (b) when the reservation was never bound to any session at all (nothing
--       was ever created at the provider under it) and a fresh attempt to
--       create that exact original request's session, using the SAME
--       Stripe idempotency key server/billing/stripe.ts already sends,
--       comes back with Stripe's own definite, synchronous rejection
--       (invalid request / auth / permission / rate limit — never a
--       connection or API error, which leaves whether a session now exists
--       genuinely ambiguous) proving nothing was created. See
--       server/billing/reservation.ts's isDefinitelyNoProviderArtifact.
--
-- Same SECURITY DEFINER / revoke-then-grant-to-service_role-only pattern,
-- empty search_path, and non-null-before-comparison discipline as every
-- other billing migration in this repo.

create table public.billing_owner_checkout_locks (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('manual','subscription')),
  request_id uuid not null,
  session_id text,
  price_id text not null,
  live boolean not null,
  created_at timestamptz not null default now(),
  constraint billing_owner_checkout_locks_price_id_not_blank check (length(trim(price_id)) > 0),
  constraint billing_owner_checkout_locks_session_id_not_blank check (session_id is null or length(trim(session_id)) > 0)
);

alter table public.billing_owner_checkout_locks enable row level security;
revoke all on table public.billing_owner_checkout_locks from public, anon, authenticated, service_role;
grant select on table public.billing_owner_checkout_locks to service_role;

-- ---------------------------------------------------------------------------
-- Reserve the owner's single checkout slot. Never raises on conflict —
-- ALWAYS returns whichever row is (now) on file for the owner, so the
-- caller can cheaply tell whether the returned row is its OWN reservation
-- (kind/request_id/price_id/live all match what it asked for — true whether
-- this call just created it or a prior call for the identical request
-- already held it, the retry-the-same-request-id case) or someone else's
-- in-flight checkout that it must not proceed past.
create function public.billing_reserve_owner_checkout(p_kind text,p_id uuid,p_owner uuid,p_price text,p_live boolean)
returns public.billing_owner_checkout_locks
language plpgsql security definer set search_path='' as $$
declare v_row public.billing_owner_checkout_locks;
begin
 if p_kind is null or p_kind not in ('manual','subscription') or p_id is null or p_owner is null or p_price is null or length(trim(p_price))=0 or p_live is null then
  raise exception 'Invalid checkout reservation';
 end if;
 -- Single shared namespace (550) for BOTH kinds — distinct from every other
 -- advisory-lock key already in use (194,196,401,402) — is exactly what
 -- makes this serialize manual and subscription checkouts against each
 -- other, which billing_begin_intent (194) and billing_begin_subscription_intent
 -- (196) alone never did.
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,550));
 select * into v_row from public.billing_owner_checkout_locks where owner_id=p_owner for update;
 if found then return v_row; end if;
 insert into public.billing_owner_checkout_locks(owner_id,kind,request_id,price_id,live) values(p_owner,p_kind,p_id,p_price,p_live) returning * into v_row;
 return v_row;
end $$;
revoke all on function public.billing_reserve_owner_checkout(text,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.billing_reserve_owner_checkout(text,uuid,uuid,text,boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Record the actual Stripe Checkout Session id the reservation produced.
-- Idempotent re-bind to the SAME session is a safe no-op (the ordinary
-- retry-the-same-request-id path); binding a DIFFERENT session to an
-- already-bound reservation, or binding under the wrong owner/kind/request
-- id, is rejected outright.
create function public.billing_bind_owner_checkout(p_owner uuid,p_kind text,p_id uuid,p_session text)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.billing_owner_checkout_locks;
begin
 if p_owner is null or p_kind is null or p_id is null or p_session is null or length(trim(p_session))=0 then raise exception 'Invalid checkout reservation binding'; end if;
 select * into v_row from public.billing_owner_checkout_locks where owner_id=p_owner for update;
 if not found or v_row.kind is distinct from p_kind or v_row.request_id is distinct from p_id then raise exception 'Invalid checkout reservation binding'; end if;
 if v_row.session_id is not null and v_row.session_id<>p_session then raise exception 'Checkout reservation already bound to a different session'; end if;
 update public.billing_owner_checkout_locks set session_id=p_session where owner_id=p_owner;
end $$;
revoke all on function public.billing_bind_owner_checkout(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.billing_bind_owner_checkout(uuid,text,uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- Release the owner's reservation. Exactly one of p_session / p_request_id
-- must be supplied and must match the row on file, so a release can only
-- ever affect the SAME reservation a caller already knows the identity of
-- (never "whatever is currently there" for an owner, which would let a
-- stale caller tear down a different, newer, legitimate in-flight checkout
-- for that same owner). Matching on session_id is how BOTH webhook success
-- (checkout.session.completed / a recorded subscription) and Stripe's own
-- checkout.session.expired event release a BOUND reservation, always keyed
-- by the provider's own session identity. Matching on request_id (with
-- p_session left null) is the ONLY other release path, used exclusively for
-- an UNBOUND reservation (session_id is still null) once
-- isDefinitelyNoProviderArtifact has proven nothing was ever created at
-- Stripe for it. Returns whether a row was actually deleted, so a repeat or
-- out-of-order release call is a safe, observable no-op rather than an
-- error — required for webhook redelivery/ordering.
create function public.billing_release_owner_checkout(p_owner uuid,p_kind text,p_session text,p_request_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_row public.billing_owner_checkout_locks;
begin
 if p_owner is null or p_kind is null or p_kind not in ('manual','subscription') or (p_session is null)=(p_request_id is null) then
  raise exception 'Invalid checkout reservation release';
 end if;
 select * into v_row from public.billing_owner_checkout_locks where owner_id=p_owner for update;
 if not found or v_row.kind is distinct from p_kind then return false; end if;
 if p_session is not null then
  if v_row.session_id is distinct from p_session then return false; end if;
 else
  if v_row.session_id is not null or v_row.request_id is distinct from p_request_id then return false; end if;
 end if;
 delete from public.billing_owner_checkout_locks where owner_id=p_owner;
 return true;
end $$;
revoke all on function public.billing_release_owner_checkout(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.billing_release_owner_checkout(uuid,text,text,uuid) to service_role;
