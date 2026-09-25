-- pgTAP tests for supabase/migrations/20260920040000_recurring_checkout.sql.
-- Run locally without Docker: npm run test:db. See recurring_billing.test.sql
-- for the harness's own limitations (no hosted Auth/PostgREST, no true
-- multi-connection concurrency).

begin;
select plan(23);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-c@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-d@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false);

set local role service_role;

-- ---------------------------------------------------------------------------
-- Intent -> checkout binding, mirroring billing_begin_intent/billing_bind_intent.
select lives_ok(
  $$select public.billing_begin_subscription_intent('aaaaaaaa-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','price_recurring_fixture',false)$$,
  'create a subscription checkout intent'
);
select lives_ok(
  $$select public.billing_begin_subscription_intent('aaaaaaaa-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','price_recurring_fixture',false)$$,
  'retrying the same intent id with identical details is a no-op'
);
select throws_ok(
  $$select public.billing_begin_subscription_intent('aaaaaaaa-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444','price_recurring_fixture',false)$$,
  'P0001','Subscription checkout request mismatch',
  'a different owner cannot reuse another owner''s intent id'
);
select lives_ok(
  $$select public.billing_bind_subscription_intent('aaaaaaaa-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','cs_sub_fixture')$$,
  'bind the intent to a trusted Stripe session id'
);
select throws_ok(
  $$select public.billing_bind_subscription_intent('aaaaaaaa-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','cs_sub_other')$$,
  'P0001','Subscription checkout already bound',
  'a bound intent cannot be rebound to a different session'
);
select is(
  (public.billing_lookup_subscription_checkout('cs_sub_fixture')).owner_id,
  '33333333-3333-3333-3333-333333333333'::uuid,
  'the trusted checkout lookup returns the authenticated owner who started it, not anything client-supplied'
);
select throws_ok(
  $$select public.billing_bind_subscription_intent('bbbbbbbb-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','cs_sub_orphan')$$,
  'P0001','Invalid subscription checkout binding',
  'binding an intent id that was never begun is rejected'
);

-- Expiry: an intent older than 23 hours cannot be reused to mint a fresh session.
reset role;
update public.billing_subscription_intents set created_at = now() - interval '24 hours' where id = 'aaaaaaaa-1111-1111-1111-111111111111';
set local role service_role;
select throws_ok(
  $$select public.billing_begin_subscription_intent('aaaaaaaa-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','price_recurring_fixture',false)$$,
  'P0001','Subscription checkout request expired',
  'an expired intent cannot be reused to recreate a Stripe session'
);

-- Rate limit: at most 3 fresh subscription-intent ids per owner per hour,
-- independent of the one-time pass's own billing_intents budget. The very
-- first intent (id ...111...) was just backdated out of the window above, so
-- it no longer counts toward this cap -- three MORE fresh ids are needed to
-- reach the limit, then a fourth is rejected.
select lives_ok(
  $$select public.billing_begin_subscription_intent('aaaaaaaa-1111-1111-1111-222222222222','33333333-3333-3333-3333-333333333333','price_recurring_fixture',false)$$,
  'first fresh intent within the window succeeds'
);
select lives_ok(
  $$select public.billing_begin_subscription_intent('aaaaaaaa-1111-1111-1111-333333333333','33333333-3333-3333-3333-333333333333','price_recurring_fixture',false)$$,
  'second fresh intent within the window succeeds'
);
select lives_ok(
  $$select public.billing_begin_subscription_intent('aaaaaaaa-1111-1111-1111-555555555555','33333333-3333-3333-3333-333333333333','price_recurring_fixture',false)$$,
  'third fresh intent within the window succeeds'
);
select throws_ok(
  $$select public.billing_begin_subscription_intent('aaaaaaaa-1111-1111-1111-444444444444','33333333-3333-3333-3333-333333333333','price_recurring_fixture',false)$$,
  'P0001','Subscription checkout request limit reached',
  'a fourth distinct fresh intent within the window is rejected'
);

-- ---------------------------------------------------------------------------
-- Per-owner checkout-attempt throttle, independent of the one-time pass's own.
select lives_ok(
  $$select public.billing_throttle_subscription_checkout_attempt('44444444-4444-4444-4444-444444444444') from generate_series(1,20)$$,
  'first 20 subscription checkout attempts in the window succeed'
);
select throws_ok(
  $$select public.billing_throttle_subscription_checkout_attempt('44444444-4444-4444-4444-444444444444')$$,
  '54000','Too many checkout attempts. Wait up to an hour and try again.',
  '21st subscription checkout attempt within the window is rejected'
);
select throws_ok(
  $$select public.billing_throttle_subscription_checkout_attempt(null)$$,
  '22023','Invalid subscription checkout attempt',
  'a null owner is rejected'
);

-- ---------------------------------------------------------------------------
-- billing_lookup_owner_subscription: only "in force" statuses are returned,
-- scoped strictly to the requesting owner.
select public.billing_record_subscription('33333333-3333-3333-3333-333333333333','sub_fixture_a','price_recurring_fixture',false,'active');
select is(
  (public.billing_lookup_owner_subscription('33333333-3333-3333-3333-333333333333')).subscription_id,
  'sub_fixture_a',
  'an active subscription is returned for its own owner'
);
select is(
  public.billing_lookup_owner_subscription('44444444-4444-4444-4444-444444444444'),
  null,
  'a different owner with no subscription of their own gets no result, not another owner''s row'
);
select public.billing_update_subscription_status('sub_fixture_a','33333333-3333-3333-3333-333333333333','canceled',false);
select is(
  public.billing_lookup_owner_subscription('33333333-3333-3333-3333-333333333333'),
  null,
  'a canceled subscription is no longer "in force" and is not returned'
);
select public.billing_record_subscription('33333333-3333-3333-3333-333333333333','sub_fixture_b','price_recurring_fixture',false,'past_due');
select is(
  (public.billing_lookup_owner_subscription('33333333-3333-3333-3333-333333333333')).subscription_id,
  'sub_fixture_b',
  'a past_due subscription (Stripe still attempting collection) counts as in force'
);

-- ---------------------------------------------------------------------------
-- Cross-role denial: the browser can neither call these RPCs nor read the
-- underlying tables directly.
set local role authenticated;
set local request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
select throws_ok(
  $$select public.billing_begin_subscription_intent('cccccccc-3333-3333-3333-333333333333','33333333-3333-3333-3333-333333333333','price_recurring_fixture',false)$$,
  '42501','permission denied for function billing_begin_subscription_intent',
  'browser cannot create a trusted subscription intent'
);
select throws_ok(
  $$select public.billing_lookup_subscription_checkout('cs_sub_fixture')$$,
  '42501','permission denied for function billing_lookup_subscription_checkout',
  'browser cannot inspect subscription checkout owners'
);
select throws_ok(
  $$select public.billing_lookup_owner_subscription('33333333-3333-3333-3333-333333333333')$$,
  '42501','permission denied for function billing_lookup_owner_subscription',
  'browser cannot look up its own subscription via this RPC (the entitlement itself remains readable via billing_entitlements)'
);
select throws_ok(
  $$select * from public.billing_subscription_checkouts$$,
  '42501','permission denied for table billing_subscription_checkouts',
  'browser cannot read subscription checkout records directly'
);
reset role;

select * from finish();
rollback;
