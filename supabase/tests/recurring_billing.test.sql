-- pgTAP tests for supabase/migrations/20260920020000_recurring_billing.sql.
--
-- Run locally without Docker: npm run test:db (PGlite/Postgres + minimal
-- Supabase auth schema, plus anon/authenticated/service_role roles — see
-- scripts/test-database.mjs). This harness does not cover hosted
-- Auth/PostgREST/webhook configuration, a real Stripe subscription
-- lifecycle, or true multi-connection concurrency (the ON CONFLICT
-- race-path inside billing_apply_subscription_invoice shares its
-- comparison logic byte-for-byte with the pre-check path exercised
-- extensively below, but is not itself triggered by a real concurrent
-- connection in this single-connection harness — same caveat
-- supabase/tests/billing_ledger.test.sql already carries for the one-time
-- pass).
--
-- `service_role` here has no JWT/claims concept — the RPCs take an explicit
-- p_owner_id argument, so tests exercise it with a plain
-- `set local role service_role;` and no request.jwt.* settings.

begin;
select plan(88);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false);

-- ---------------------------------------------------------------------------
-- No authenticated/anon forged access at all: neither table nor any RPC is
-- reachable outside service_role.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$select * from public.billing_subscriptions$$, '42501', null,
  'authenticated cannot read billing_subscriptions'
);
select throws_ok(
  $$select * from public.billing_subscription_invoices$$, '42501', null,
  'authenticated cannot read billing_subscription_invoices'
);
select throws_ok(
  $$insert into public.billing_subscriptions (subscription_id, owner_id, price_id, live, status) values ('sub_forged','11111111-1111-1111-1111-111111111111','price_x',false,'active')$$,
  '42501', null,
  'authenticated cannot self-insert a subscription record'
);
select throws_ok(
  $$update public.billing_subscriptions set status = 'canceled' where owner_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'authenticated cannot directly update a subscription record'
);
select throws_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_forged','price_x',false,'active')$$,
  '42501', null, 'authenticated cannot call billing_record_subscription'
);
select throws_ok(
  $$select public.billing_lookup_subscription('sub_forged')$$,
  '42501', null, 'authenticated cannot call billing_lookup_subscription'
);
select throws_ok(
  $$select public.billing_update_subscription_status('sub_forged','11111111-1111-1111-1111-111111111111','canceled',true)$$,
  '42501', null, 'authenticated cannot call billing_update_subscription_status'
);
select throws_ok(
  $$select public.billing_record_failed_subscription_invoice('sub_forged','in_forged','11111111-1111-1111-1111-111111111111','usd',now())$$,
  '42501', null, 'authenticated cannot call billing_record_failed_subscription_invoice'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_forged','in_forged','11111111-1111-1111-1111-111111111111','price_x',false,1999,'usd',now(),now()+interval '30 days',now())$$,
  '42501', null, 'authenticated cannot call billing_apply_subscription_invoice'
);

set local role anon;
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'anonymous cannot read billing_subscriptions');
select throws_ok($$select * from public.billing_subscription_invoices$$, '42501', null, 'anonymous cannot read billing_subscription_invoices');
select throws_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_forged2','price_x',false,'active')$$,
  '42501', null, 'anonymous cannot call billing_record_subscription'
);
reset role;

-- ---------------------------------------------------------------------------
-- billing_record_subscription: identity is immutable, status is updatable,
-- and every field is validated explicitly rather than left to an incidental
-- constraint failure.
-- ---------------------------------------------------------------------------
set local role service_role;

select lives_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_test_1','price_recurring',false,'incomplete')$$,
  'service_role can record a new subscription'
);
select is(
  (select status from public.billing_subscriptions where subscription_id = 'sub_test_1'),
  'incomplete',
  'the subscription was recorded with its initial status'
);
select lives_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_test_1','price_recurring',false,'active')$$,
  're-recording the same subscription with a new status is allowed (status transition)'
);
select is(
  (select status from public.billing_subscriptions where subscription_id = 'sub_test_1'),
  'active',
  'the status transition was applied'
);
select is(
  (select count(*)::int from public.billing_subscriptions where subscription_id = 'sub_test_1'),
  1,
  'no duplicate row was created by the status transition'
);
select throws_ok(
  $$select public.billing_record_subscription('22222222-2222-2222-2222-222222222222','sub_test_1','price_recurring',false,'active')$$,
  'P0001', null,
  'a subscription id can never be rebound to a different owner'
);
select throws_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_test_1','price_other',false,'active')$$,
  'P0001', null,
  'a subscription id can never be rebound to a different price'
);
select throws_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_test_1','price_recurring',true,'active')$$,
  'P0001', null,
  'a subscription id can never be rebound to a different live/test mode'
);
select throws_ok(
  $$select public.billing_record_subscription(null,'sub_rc_null_owner','price_recurring',false,'active')$$,
  'P0001', null, 'a null owner id is rejected'
);
select throws_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','','price_recurring',false,'active')$$,
  'P0001', null, 'a blank subscription id is rejected'
);
select throws_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_rc_blank_price','',false,'active')$$,
  'P0001', null, 'a blank price id is rejected'
);
select throws_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_rc_null_live','price_recurring',null,'active')$$,
  'P0001', null, 'a null live flag is rejected'
);
select throws_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_rc_bad_status','price_recurring',false,'made_up_status')$$,
  'P0001', null, 'an unrecognized status is rejected'
);

select is(
  (select owner_id::text from public.billing_lookup_subscription('sub_test_1')),
  '11111111-1111-1111-1111-111111111111',
  'billing_lookup_subscription returns the trusted record for handler-side owner binding'
);
select is(
  (select subscription_id from public.billing_lookup_subscription('sub_never_recorded')),
  null,
  'billing_lookup_subscription returns nothing for an unknown subscription id'
);

-- ---------------------------------------------------------------------------
-- billing_apply_subscription_invoice: null/blank/invalid-timestamp
-- rejections, none of which write anything.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice(null,'in_null_sub','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a null subscription id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a blank invoice id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_null_owner',null,'price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a null owner id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_zero_amount','11111111-1111-1111-1111-111111111111','price_recurring',false,0,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a zero amount is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_blank_currency','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a blank currency is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_reversed_period','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd','2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a reversed invoice period (end before start) is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_equal_period','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a zero-length invoice period is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_huge_period','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2028-01-01T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'an implausibly long invoice period is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_null_time','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,null)$$,
  'P0001', null, 'a null verified-at time is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_future_time','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2100-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'an implausible future verified-at time is rejected'
);
select is(
  (select count(*)::int from public.billing_subscription_invoices),
  0,
  'none of the null/blank/invalid rejections above wrote a ledger row'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  null,
  'none of the null/blank/invalid rejections above created or changed an entitlement'
);

-- ---------------------------------------------------------------------------
-- billing_apply_subscription_invoice: mismatch against the trusted
-- subscription record, or no trusted record at all, is rejected outright.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_bad_price','11111111-1111-1111-1111-111111111111','price_wrong',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'an invoice whose price does not match the trusted subscription record is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_bad_live','11111111-1111-1111-1111-111111111111','price_recurring',true,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'an invoice whose live/test mode does not match the trusted subscription record is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_test_1','in_bad_owner','22222222-2222-2222-2222-222222222222','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'an invoice claiming a different owner than the trusted subscription record is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice('sub_never_recorded','in_no_subscription','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'an invoice against a subscription with no trusted record at all is rejected'
);
select is(
  (select count(*)::int from public.billing_subscription_invoices),
  0,
  'none of the mismatched/missing-subscription attempts wrote a ledger row'
);

-- ---------------------------------------------------------------------------
-- A genuine first invoice grants exactly its own period end (not an
-- additive 30-day stack — this is a different rule from the one-time pass).
-- ---------------------------------------------------------------------------
select results_eq(
  $$select paid_through, applied from public.billing_apply_subscription_invoice(
    'sub_test_1','in_1','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-01-31T00:00:00Z'::timestamptz, true)$$,
  'a first paid invoice grants paid_through equal to its own period end'
);
select is(
  (select status from public.billing_subscriptions where subscription_id = 'sub_test_1'),
  'active',
  'a successfully applied invoice marks the subscription active'
);
select is(
  (select current_period_end from public.billing_subscriptions where subscription_id = 'sub_test_1'),
  '2026-01-31T00:00:00Z'::timestamptz,
  'the subscription record tracks the latest applied period end'
);

-- Exact-match retry (the same webhook redelivered): idempotent no-op.
select results_eq(
  $$select paid_through, applied from public.billing_apply_subscription_invoice(
    'sub_test_1','in_1','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-01-31T00:00:00Z'::timestamptz, false)$$,
  'resending the exact same invoice id is a no-op: same paid_through, applied=false'
);
select is(
  (select count(*)::int from public.billing_subscription_invoices where invoice_id = 'in_1'),
  1,
  'the duplicate call did not write a second ledger row'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice(
    'sub_test_1','in_1','11111111-1111-1111-1111-111111111111','price_recurring',false,500,'usd',
    '2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz
  )$$,
  'P0001', null,
  'reusing an already-applied invoice id with a different amount is rejected, not silently absorbed'
);
select is(
  (select count(*)::int from public.billing_subscription_invoices),
  1,
  'the conflicting-reuse attempt did not write a second ledger row'
);

-- ---------------------------------------------------------------------------
-- The next billing cycle's invoice, arriving normally in order, advances
-- paid_through to ITS period end (max, not addition — 30 days again, but
-- because the new period end IS 30 days later, not because 30 days was
-- added on top).
-- ---------------------------------------------------------------------------
select results_eq(
  $$select paid_through, applied from public.billing_apply_subscription_invoice(
    'sub_test_1','in_2','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd',
    '2026-01-31T00:00:00Z'::timestamptz,'2026-03-02T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-03-02T00:00:00Z'::timestamptz, true)$$,
  'the next cycle''s invoice advances paid_through to its own period end'
);

-- ---------------------------------------------------------------------------
-- Out-of-order delivery: a LATER cycle's invoice (in_4) arrives before an
-- EARLIER cycle's invoice (in_3) for the same subscription. Applying in_3
-- after in_4 must NOT grant double time or move paid_through backward.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select paid_through, applied from public.billing_apply_subscription_invoice(
    'sub_test_1','in_4','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd',
    '2026-04-01T00:00:00Z'::timestamptz,'2026-05-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-05-01T00:00:00Z'::timestamptz, true)$$,
  'a later cycle''s invoice, applied first, advances paid_through to its own (later) period end'
);
select results_eq(
  $$select paid_through, applied from public.billing_apply_subscription_invoice(
    'sub_test_1','in_3','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd',
    '2026-03-02T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz,'2026-03-02T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-05-01T00:00:00Z'::timestamptz, true)$$,
  'the earlier cycle''s invoice, arriving late, is genuinely new (applied=true, it is still recorded) but does NOT move paid_through backward or grant extra time on top'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-05-01T00:00:00Z'::timestamptz,
  'paid_through remains at the later period end after the out-of-order invoice is applied'
);
select is(
  (select current_period_end from public.billing_subscriptions where subscription_id = 'sub_test_1'),
  '2026-05-01T00:00:00Z'::timestamptz,
  'the tracked current_period_end also does not move backward for the out-of-order invoice'
);
select is(
  (select count(*)::int from public.billing_subscription_invoices where subscription_id = 'sub_test_1' and outcome = 'granted'),
  4,
  'all four genuine invoices (in_1, in_2, in_3 out-of-order, in_4) are each recorded exactly once'
);

-- ---------------------------------------------------------------------------
-- Manual-pass overlap: renewal does not charge for already-prepaid time.
-- Owner A buys a one-time manual pass (via the existing billing_ledger
-- migration's own RPCs) that extends paid_through well beyond the
-- subscription's next period end. The subscription's own renewal invoice
-- for that overlapping period must be recorded (for accounting) but must
-- NOT shorten, overwrite, or "double-charge" the manual prepaid time.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_manual_pass',false,'cs_overlap_1',1999,'usd')$$,
  'a one-time manual pass checkout can be recorded for the subscriber'
);
-- Owner A's paid_through is 2026-05-01 here (from the invoice sequence
-- above). manualPassWindow stacks exactly 30 days (2,592,000 seconds) onto
-- that: 2026-05-01 + 30 days = 2026-05-31, NOT a calendar month — matching
-- server/billing/policy.ts's manualPassWindow/PASS_MS exactly.
select results_eq(
  $$select paid_through, applied from public.billing_apply_verified_payment(
    '11111111-1111-1111-1111-111111111111','cs_overlap_1','evt_overlap_1','pi_overlap_1','price_manual_pass',false,1999,'usd',
    '2026-05-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-05-31T00:00:00Z'::timestamptz, true)$$,
  'the manual pass stacks a full 30 days onto the existing subscription-granted paid_through (May 1 -> May 31)'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-05-31T00:00:00Z'::timestamptz,
  'sanity: the manual pass extended paid_through beyond the subscription''s next renewal invoice period end used below'
);
select lives_ok(
  $$select public.billing_record_subscription('11111111-1111-1111-1111-111111111111','sub_test_1','price_recurring',false,'active')$$,
  'sanity: the subscription remains recorded for the same owner'
);
-- The subscription's own next renewal invoice covers [May 1, May 16] — a
-- period entirely inside the manually-prepaid May 1-31 span. Applying it
-- must be recorded (for accounting) but must NOT shorten the May 31
-- manual-pass coverage, and must NOT stack an extra 30 days on top of it
-- either (that would be double-charging for time already prepaid).
select results_eq(
  $$select paid_through, applied from public.billing_apply_subscription_invoice(
    'sub_test_1','in_5','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd',
    '2026-05-01T00:00:00Z'::timestamptz,'2026-05-16T00:00:00Z'::timestamptz,'2026-05-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-05-31T00:00:00Z'::timestamptz, true)$$,
  'the subscription''s renewal invoice for an already-prepaid period is recorded (applied=true, a genuinely new invoice) but grants no additional time and does not shorten the manual pass'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-05-31T00:00:00Z'::timestamptz,
  'paid_through is unchanged: the manually prepaid time was not consumed or double-charged by the subscription renewal'
);
select is(
  (select count(*)::int from public.billing_subscription_invoices where invoice_id = 'in_5' and outcome = 'granted'),
  1,
  'the overlapping renewal invoice is still recorded in the ledger for accounting/audit'
);

-- ---------------------------------------------------------------------------
-- Failed invoices grant nothing, are still auditable, are idempotent, and
-- are checked against the same trusted-subscription identity.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.billing_record_failed_subscription_invoice(null,'in_fail_null_sub','11111111-1111-1111-1111-111111111111','usd',now())$$,
  'P0001', null, 'a null subscription id is rejected for a failed invoice'
);
select throws_ok(
  $$select public.billing_record_failed_subscription_invoice('sub_test_1','','11111111-1111-1111-1111-111111111111','usd',now())$$,
  'P0001', null, 'a blank invoice id is rejected for a failed invoice'
);
select throws_ok(
  $$select public.billing_record_failed_subscription_invoice('sub_never_recorded','in_fail_no_sub','11111111-1111-1111-1111-111111111111','usd',now())$$,
  'P0001', null, 'a failed invoice against an unknown subscription is rejected'
);
select throws_ok(
  $$select public.billing_record_failed_subscription_invoice('sub_test_1','in_fail_bad_owner','22222222-2222-2222-2222-222222222222','usd',now())$$,
  'P0001', null, 'a failed invoice claiming the wrong owner is rejected'
);
select lives_ok(
  $$select public.billing_record_failed_subscription_invoice('sub_test_1','in_fail_1','11111111-1111-1111-1111-111111111111','usd','2026-06-01T00:00:00Z'::timestamptz)$$,
  'a genuine failed invoice is recorded'
);
select is(
  (select outcome from public.billing_subscription_invoices where invoice_id = 'in_fail_1'),
  'failed',
  'the failed invoice is recorded with outcome=failed'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-05-31T00:00:00Z'::timestamptz,
  'the failed invoice did not change the entitlement at all'
);
select lives_ok(
  $$select public.billing_record_failed_subscription_invoice('sub_test_1','in_fail_1','11111111-1111-1111-1111-111111111111','usd','2026-06-01T00:00:00Z'::timestamptz)$$,
  'redelivering the exact same failed invoice is an idempotent no-op'
);
select is(
  (select count(*)::int from public.billing_subscription_invoices where invoice_id = 'in_fail_1'),
  1,
  'the duplicate failed-invoice call did not write a second row'
);

-- ---------------------------------------------------------------------------
-- Cancellation preserves paid_through: canceling touches ONLY the
-- subscription record, never the entitlement.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.billing_update_subscription_status('sub_never_recorded','11111111-1111-1111-1111-111111111111','canceled',true)$$,
  'P0001', null, 'canceling an unknown subscription is rejected'
);
select throws_ok(
  $$select public.billing_update_subscription_status('sub_test_1','22222222-2222-2222-2222-222222222222','canceled',true)$$,
  'P0001', null, 'canceling a subscription under the wrong claimed owner is rejected'
);
select throws_ok(
  $$select public.billing_update_subscription_status('sub_test_1','11111111-1111-1111-1111-111111111111','made_up_status',true)$$,
  'P0001', null, 'an unrecognized status is rejected on cancellation'
);
select lives_ok(
  $$select public.billing_update_subscription_status('sub_test_1','11111111-1111-1111-1111-111111111111','active',true)$$,
  'marking cancel_at_period_end=true (the "cancel, keep access until period end" flow) succeeds'
);
select is(
  (select cancel_at_period_end from public.billing_subscriptions where subscription_id = 'sub_test_1'),
  true,
  'cancel_at_period_end is now recorded true'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-05-31T00:00:00Z'::timestamptz,
  'requesting cancellation did not touch paid_through at all'
);
select lives_ok(
  $$select public.billing_update_subscription_status('sub_test_1','11111111-1111-1111-1111-111111111111','canceled',true)$$,
  'the eventual customer.subscription.deleted-equivalent transition to status=canceled succeeds'
);
select is(
  (select status from public.billing_subscriptions where subscription_id = 'sub_test_1'),
  'canceled',
  'the subscription is now recorded as canceled'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-05-31T00:00:00Z'::timestamptz,
  'the final cancellation still did not touch paid_through — access lapses naturally via isPro(), never by explicit retraction'
);

-- A canceled subscription can still receive its already-in-flight final
-- invoice (e.g. a proration settled after cancellation was requested);
-- this is unaffected by the cancellation status. This invoice's period
-- (May 31 -> Jun 30) is genuinely later than the manually-prepaid May 31
-- boundary, so it correctly ADVANCES paid_through by another 30 days.
select results_eq(
  $$select paid_through, applied from public.billing_apply_subscription_invoice(
    'sub_test_1','in_6','11111111-1111-1111-1111-111111111111','price_recurring',false,1999,'usd',
    '2026-05-31T00:00:00Z'::timestamptz,'2026-06-30T00:00:00Z'::timestamptz,'2026-05-31T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-06-30T00:00:00Z'::timestamptz, true)$$,
  'a still-valid, genuinely later invoice for a since-canceled subscription is applied normally, advancing paid_through (cancellation status does not block a prior legitimate invoice)'
);

-- ---------------------------------------------------------------------------
-- Cross-owner isolation: owner B's independent subscription/invoices never
-- affect owner A's ledger or entitlement, and vice versa.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.billing_record_subscription('22222222-2222-2222-2222-222222222222','sub_test_b1','price_recurring',false,'active')$$,
  'a subscription can be recorded for a second, unrelated owner'
);
select results_eq(
  $$select paid_through, applied from public.billing_apply_subscription_invoice(
    'sub_test_b1','in_b1','22222222-2222-2222-2222-222222222222','price_recurring',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz,'2026-01-31T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-01-31T00:00:00Z'::timestamptz, true)$$,
  'owner B''s independent invoice grants their own paid_through'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-06-30T00:00:00Z'::timestamptz,
  'owner A''s entitlement is untouched by owner B''s subscription/invoice'
);
select throws_ok(
  $$select public.billing_update_subscription_status('sub_test_b1','11111111-1111-1111-1111-111111111111','canceled',true)$$,
  'P0001', null,
  'owner A cannot cancel owner B''s subscription by guessing its id'
);

reset role;

-- ---------------------------------------------------------------------------
-- The user-visible entitlement view (billing_entitlements, from the
-- existing billing_ledger migration) reflects subscription-granted time
-- exactly like manual-pass time — RLS scoping is already proven in
-- supabase/tests/billing_ledger.test.sql; this just confirms subscription
-- grants land in the same row a subscriber would actually read.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select paid_through from public.billing_entitlements where owner_id = '22222222-2222-2222-2222-222222222222'),
  '2026-01-31T00:00:00Z'::timestamptz,
  'owner B can read their subscription-granted entitlement through the existing user-facing row'
);

reset role;
select * from finish();
rollback;
