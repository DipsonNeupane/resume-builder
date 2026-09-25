-- pgTAP tests for supabase/migrations/20260919210000_billing_ledger.sql.
--
-- Run locally without Docker: npm run test:db (PGlite/Postgres + minimal
-- Supabase auth schema, plus `anon`/`authenticated`/`service_role` roles —
-- see scripts/test-database.mjs). Also run against the Supabase local stack
-- (`supabase test db`) before hosted enablement; this harness does not cover
-- hosted Auth/PostgREST/webhook configuration or true multi-connection
-- concurrency (the ON CONFLICT race-path validation inside
-- billing_apply_verified_payment shares its comparison logic byte-for-byte
-- with the pre-check path exercised extensively below, but is not itself
-- triggered by a real concurrent connection in this single-connection
-- harness — same argue-from-Postgres-locking-semantics caveat this repo's
-- other migrations already carry).
--
-- `service_role` here has no JWT/claims concept — the RPCs take an explicit
-- p_owner_id argument (the server's own verified Supabase Auth user id, per
-- server/http/security.ts's authenticate()), so tests exercise it with a
-- plain `set local role service_role;` and no request.jwt.* settings.

begin;
select plan(70);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false);

-- ---------------------------------------------------------------------------
-- No authenticated forged grants: neither the tables nor the RPCs are
-- reachable by a signed-in browser session, only by service_role.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$select * from public.billing_checkouts$$, '42501', null,
  'authenticated cannot read billing_checkouts at all, not even their own'
);
select throws_ok(
  $$select * from public.billing_payments$$, '42501', null,
  'authenticated cannot read billing_payments at all'
);
select throws_ok(
  $$insert into public.billing_entitlements (owner_id, paid_through) values ('11111111-1111-1111-1111-111111111111', now() + interval '30 days')$$,
  '42501', null,
  'authenticated cannot self-grant an entitlement by inserting directly'
);
select throws_ok(
  $$update public.billing_entitlements set paid_through = now() + interval '30 days' where owner_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'authenticated cannot self-extend an entitlement by updating directly'
);
select throws_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_fixture',false,'cs_forged_1',1999,'usd')$$,
  '42501', null,
  'authenticated cannot call billing_record_checkout (EXECUTE revoked)'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_forged_1','evt_forged','pi_forged','price_fixture',false,1999,'usd',now())$$,
  '42501', null,
  'authenticated cannot call billing_apply_verified_payment (EXECUTE revoked)'
);

select is(
  (select count(*)::int from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'sanity: no entitlement row exists yet for owner A'
);

set local role anon;
select throws_ok($$select * from public.billing_checkouts$$, '42501', null, 'anonymous cannot read billing_checkouts');
select throws_ok($$select * from public.billing_payments$$, '42501', null, 'anonymous cannot read billing_payments');
select throws_ok($$select * from public.billing_entitlements$$, '42501', null, 'anonymous cannot read billing_entitlements');
select throws_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_fixture',false,'cs_forged_2',1999,'usd')$$,
  '42501', null,
  'anonymous cannot call billing_record_checkout'
);
reset role;

-- ---------------------------------------------------------------------------
-- billing_record_checkout: server-only writes, idempotent exact-match
-- retries, rejects a mismatched retry, and explicitly rejects null/blank
-- fields rather than relying on incidental constraint failures.
-- ---------------------------------------------------------------------------
set local role service_role;

select lives_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_fixture',false,'cs_test_1',1999,'usd')$$,
  'service_role can record a checkout'
);
select lives_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_fixture',false,'cs_test_1',1999,'usd')$$,
  'an exact-match retry of the same checkout session is a harmless no-op'
);
select is(
  (select count(*)::int from public.billing_checkouts where session_id = 'cs_test_1'),
  1,
  'the retry did not create a second row'
);
select throws_ok(
  $$select public.billing_record_checkout('22222222-2222-2222-2222-222222222222','price_fixture',false,'cs_test_1',1999,'usd')$$,
  'P0001', null,
  'reusing a session id with a different owner is rejected, not silently accepted'
);

select throws_ok(
  $$select public.billing_record_checkout(null,'price_fixture',false,'cs_rc_null_owner',1999,'usd')$$,
  'P0001', null, 'billing_record_checkout rejects a null owner id'
);
select throws_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','',false,'cs_rc_blank_price',1999,'usd')$$,
  'P0001', null, 'billing_record_checkout rejects a blank price id'
);
select throws_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_fixture',null,'cs_rc_null_live',1999,'usd')$$,
  'P0001', null, 'billing_record_checkout rejects a null live flag'
);
select throws_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_fixture',false,'cs_rc_zero_amount',0,'usd')$$,
  'P0001', null, 'billing_record_checkout rejects a non-positive expected amount'
);
select throws_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_fixture',false,'cs_rc_blank_currency',1999,'')$$,
  'P0001', null, 'billing_record_checkout rejects a blank currency'
);

-- ---------------------------------------------------------------------------
-- billing_apply_verified_payment: null/blank fields are rejected explicitly,
-- not left to an incidental downstream NOT NULL constraint (which would
-- both give a confusing error and, for `<>` comparisons done before any
-- insert is attempted, silently fail to raise at all — NULL <> x is
-- UNKNOWN, and `if unknown then` never fires).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.billing_apply_verified_payment(null,'cs_test_1','evt_null_owner','pi_null_owner','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a null owner id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','','evt_blank_session','pi_blank_session','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a blank session id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1',null,'pi_null_event','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a null event id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_blank_payment','','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a blank payment id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_null_price','pi_null_price',null,false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a null price id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_null_live','pi_null_live','price_fixture',null,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a null live flag is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_null_amount','pi_null_amount','price_fixture',false,null,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a null amount is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_zero_amount','pi_zero_amount','price_fixture',false,0,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a zero amount is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_blank_currency','pi_blank_currency','price_fixture',false,1999,'','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a blank currency is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_null_time','pi_null_time','price_fixture',false,1999,'usd',null)$$,
  'P0001', null, 'a null verified-at time is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_inf_time','pi_inf_time','price_fixture',false,1999,'usd','infinity'::timestamptz)$$,
  'P0001', null, 'a positive-infinity verified-at time is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_neg_inf_time','pi_neg_inf_time','price_fixture',false,1999,'usd','-infinity'::timestamptz)$$,
  'P0001', null, 'a negative-infinity verified-at time is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_pre_epoch','pi_pre_epoch','price_fixture',false,1999,'usd','1900-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'a verified-at time before the Unix epoch is rejected (same domain as policy.ts timestamp())'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_future_time','pi_future_time','price_fixture',false,1999,'usd','2100-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null, 'an implausible future verified-at time is rejected'
);
select is(
  (select count(*)::int from public.billing_payments),
  0,
  'none of the null/blank/invalid-timestamp rejections above wrote a ledger row'
);
select is(
  (select count(*)::int from public.billing_entitlements),
  0,
  'none of the null/blank/invalid-timestamp rejections above created an entitlement'
);

-- ---------------------------------------------------------------------------
-- billing_apply_verified_payment: invalid amount/currency/price/live
-- mismatch against the trusted checkout record is rejected outright, before
-- any ledger row or entitlement change.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_bad_amount','pi_bad_amount','price_fixture',false,1,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null,
  'a payment whose amount does not match its trusted checkout record is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_bad_currency','pi_bad_currency','price_fixture',false,1999,'eur','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null,
  'a payment whose currency does not match its trusted checkout record is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_bad_price','pi_bad_price','price_other',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null,
  'a payment whose price id does not match its trusted checkout record is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_bad_live','pi_bad_live','price_fixture',true,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null,
  'a payment whose live/test mode does not match its trusted checkout record is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('22222222-2222-2222-2222-222222222222','cs_test_1','evt_bad_owner','pi_bad_owner','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null,
  'a payment claiming a different owner than its trusted checkout record is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_never_recorded','evt_no_checkout','pi_no_checkout','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz)$$,
  'P0001', null,
  'a payment against a session with no trusted checkout record at all is rejected'
);
select is(
  (select count(*)::int from public.billing_payments),
  0,
  'none of the rejected mismatched/missing-checkout attempts wrote a ledger row'
);
select is(
  (select count(*)::int from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'none of the rejected attempts created or changed an entitlement'
);

-- ---------------------------------------------------------------------------
-- A genuine first payment grants exactly one 30-day (2,592,000-second) pass
-- starting at the verified payment time, matching
-- server/billing/policy.ts's PASS_MS/manualPassWindow exactly.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select paid_through, applied from public.billing_apply_verified_payment(
    '11111111-1111-1111-1111-111111111111','cs_test_1','evt_1','pi_1','price_fixture',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-01-31T00:00:00Z'::timestamptz, true)$$,
  'a genuine first payment grants a 30-day pass starting at the verified payment time'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-01-31T00:00:00Z'::timestamptz,
  'the entitlement row now reflects the granted pass'
);

-- Duplicate payment (same event_id AND same payment_id) must not extend the
-- pass again — this is the idempotency-by-event/payment-id requirement.
select results_eq(
  $$select paid_through, applied from public.billing_apply_verified_payment(
    '11111111-1111-1111-1111-111111111111','cs_test_1','evt_1','pi_1','price_fixture',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-01-31T00:00:00Z'::timestamptz, false)$$,
  'resending the exact same event/payment id is a no-op: same paid_through, applied=false'
);
select is(
  (select count(*)::int from public.billing_payments where event_id = 'evt_1'),
  1,
  'the duplicate call did not write a second ledger row'
);

-- Legitimate case: a different Stripe event id notifying about the SAME
-- real payment (payment_id and every other immutable fact identical) is
-- still a no-op, not a conflict.
select results_eq(
  $$select paid_through, applied from public.billing_apply_verified_payment(
    '11111111-1111-1111-1111-111111111111','cs_test_1','evt_1_retry','pi_1','price_fixture',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-01-31T00:00:00Z'::timestamptz, false)$$,
  'a duplicate payment_id under a different event_id is also a no-op, not a second grant'
);
select is(
  (select count(*)::int from public.billing_payments),
  1,
  'still only one ledger row exists after both duplicate-detection paths'
);

-- ---------------------------------------------------------------------------
-- Conflicting reuse of an already-recorded event_id/payment_id (different
-- owner/session/amount/price than the row actually on file) must be
-- rejected outright, never silently treated as an equivalent no-op.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.billing_apply_verified_payment(
    '22222222-2222-2222-2222-222222222222','cs_test_1','evt_1','pi_conflict_owner','price_fixture',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz
  )$$,
  'P0001', null,
  'reusing an already-applied event_id under a different owner is rejected, not treated as that owner''s no-op'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment(
    '11111111-1111-1111-1111-111111111111','cs_test_other_session','evt_conflict_session','pi_1','price_fixture',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz
  )$$,
  'P0001', null,
  'reusing an already-applied payment_id under a different checkout session is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment(
    '11111111-1111-1111-1111-111111111111','cs_test_1','evt_conflict_amount','pi_1','price_fixture',false,500,'usd',
    '2026-01-01T00:00:00Z'::timestamptz
  )$$,
  'P0001', null,
  'reusing an already-applied payment_id with a different amount is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_verified_payment(
    '11111111-1111-1111-1111-111111111111','cs_test_1','evt_conflict_price','pi_1','price_other',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz
  )$$,
  'P0001', null,
  'reusing an already-applied payment_id with a different price id is rejected'
);
select is(
  (select count(*)::int from public.billing_payments),
  1,
  'none of the conflicting-reuse attempts wrote a second ledger row'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-01-31T00:00:00Z'::timestamptz,
  'none of the conflicting-reuse attempts changed owner A''s entitlement'
);

-- ---------------------------------------------------------------------------
-- Active pass stacking: a second genuine payment verified BEFORE the first
-- pass expires adds a full 30 days on top of the remaining time, not from
-- "now" and not overlapping/replacing it.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_fixture',false,'cs_test_2',1999,'usd')$$,
  'a second checkout can be recorded for the same owner'
);
select results_eq(
  $$select paid_through, applied from public.billing_apply_verified_payment(
    '11111111-1111-1111-1111-111111111111','cs_test_2','evt_2','pi_2','price_fixture',false,1999,'usd',
    '2026-01-11T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-03-02T00:00:00Z'::timestamptz, true)$$,
  'an early purchase while still active stacks a full 30 days onto the remaining time (Jan 31 + 30d = Mar 2)'
);

-- ---------------------------------------------------------------------------
-- Expired pass: a third genuine payment verified AFTER the (now-stacked)
-- pass has expired starts fresh from its own payment time, not from the
-- stale expired paid_through.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.billing_record_checkout('11111111-1111-1111-1111-111111111111','price_fixture',false,'cs_test_3',1999,'usd')$$,
  'a third checkout can be recorded for the same owner'
);
select results_eq(
  $$select paid_through, applied from public.billing_apply_verified_payment(
    '11111111-1111-1111-1111-111111111111','cs_test_3','evt_3','pi_3','price_fixture',false,1999,'usd',
    '2026-06-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-07-01T00:00:00Z'::timestamptz, true)$$,
  'a purchase made after the pass already expired starts a fresh 30-day window from the payment time'
);
select is(
  (select count(*)::int from public.billing_payments where owner_id = '11111111-1111-1111-1111-111111111111'),
  3,
  'three genuine payments now exist in the ledger for owner A (duplicates/conflicts above did not add rows)'
);

-- ---------------------------------------------------------------------------
-- Cross-owner isolation: owner B's own genuine purchase is unaffected by and
-- does not affect owner A's ledger/entitlement.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.billing_record_checkout('22222222-2222-2222-2222-222222222222','price_fixture',false,'cs_test_b1',1999,'usd')$$,
  'a checkout can be recorded for a second, unrelated owner'
);
select results_eq(
  $$select paid_through, applied from public.billing_apply_verified_payment(
    '22222222-2222-2222-2222-222222222222','cs_test_b1','evt_b1','pi_b1','price_fixture',false,1999,'usd',
    '2026-01-01T00:00:00Z'::timestamptz
  )$$,
  $$values ('2026-01-31T00:00:00Z'::timestamptz, true)$$,
  'owner B''s independent purchase grants their own 30-day pass'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-07-01T00:00:00Z'::timestamptz,
  'owner A''s entitlement is untouched by owner B''s purchase'
);

reset role;

-- ---------------------------------------------------------------------------
-- User read-only entitlement via RLS: each owner sees only their own row,
-- with no write path available regardless (covered above).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select paid_through from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  '2026-07-01T00:00:00Z'::timestamptz,
  'owner A can read their own entitlement'
);
select is(
  (select count(*)::int from public.billing_entitlements where owner_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'owner A cannot see owner B''s entitlement row (RLS scoping)'
);

set local request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select paid_through from public.billing_entitlements where owner_id = '22222222-2222-2222-2222-222222222222'),
  '2026-01-31T00:00:00Z'::timestamptz,
  'owner B can read their own entitlement'
);
select is(
  (select count(*)::int from public.billing_entitlements where owner_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'owner B cannot see owner A''s entitlement row (RLS scoping)'
);

reset role;
select throws_ok($$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_1','pi_different','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z')$$,'P0001','Payment identifier already recorded with conflicting details','existing event cannot silently substitute payment ID');
select throws_ok($$select * from public.billing_apply_verified_payment('11111111-1111-1111-1111-111111111111','cs_test_1','evt_different','pi_different','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z')$$,'P0001','Payment identifier already recorded with conflicting details','session uniqueness conflict cannot silently substitute payment ID');
select * from finish();
rollback;
