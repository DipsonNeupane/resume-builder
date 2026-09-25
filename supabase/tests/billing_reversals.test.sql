-- pgTAP tests for supabase/migrations/20260920030000_billing_reversals.sql.
--
-- Run locally without Docker: npm run test:db (see scripts/test-database.mjs
-- for the PGlite/Postgres harness and its minimal Supabase auth schema plus
-- anon/authenticated/service_role roles). Same caveat as
-- supabase/tests/billing_ledger.test.sql: this harness does not cover hosted
-- Auth/PostgREST/webhook configuration or true multi-connection concurrency.
--
-- Fixtures use billing_record_checkout/billing_apply_verified_payment (the
-- existing, already-tested ledger RPCs) to create real payment rows, then
-- exercise billing_apply_reversal_event against them — never inserting into
-- billing_payments/billing_entitlements directly, so these tests also prove
-- the two RPCs compose correctly.

begin;
select plan(36);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reversal-a@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reversal-b@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reversal-c@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reversal-d@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false);

-- ---------------------------------------------------------------------------
-- Access control: neither anon nor a signed-in browser session can read the
-- reversal ledger or call the RPC (EXECUTE revoked, no RLS policy at all).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub to '55555555-5555-5555-5555-555555555555';
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select throws_ok(
  $$select * from public.billing_reversal_events$$, '42501', null,
  'authenticated cannot read billing_reversal_events at all'
);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_forged','pi_forged','refund',null,now(),1999)$$,
  '42501', null,
  'authenticated cannot call billing_apply_reversal_event (EXECUTE revoked)'
);
reset role;
set local role anon;
select throws_ok(
  $$select * from public.billing_reversal_events$$, '42501', null,
  'anon cannot read billing_reversal_events'
);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_forged','pi_forged','refund',null,now(),1999)$$,
  '42501', null,
  'anon cannot call billing_apply_reversal_event'
);
reset role;

-- ---------------------------------------------------------------------------
-- Fixtures: owner A gets two stacked manual passes (pi_a1 then pi_a2, the
-- second purchased while the first was still active so it durably records a
-- stacked window); owner B gets a single pass, for the refund/chargeback/
-- dispute-win scenarios that don't need stacking.
-- ---------------------------------------------------------------------------
set local role service_role;
select public.billing_record_checkout('55555555-5555-5555-5555-555555555555','price_fixture',false,'cs_a1',1999,'usd');
select public.billing_apply_verified_payment('55555555-5555-5555-5555-555555555555','cs_a1','evt_a1','pi_a1','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz);
select public.billing_record_checkout('55555555-5555-5555-5555-555555555555','price_fixture',false,'cs_a2',1999,'usd');
select public.billing_apply_verified_payment('55555555-5555-5555-5555-555555555555','cs_a2','evt_a2','pi_a2','price_fixture',false,1999,'usd','2026-01-05T00:00:00Z'::timestamptz);
select public.billing_record_checkout('66666666-6666-6666-6666-666666666666','price_fixture',false,'cs_b1',1999,'usd');
select public.billing_apply_verified_payment('66666666-6666-6666-6666-666666666666','cs_b1','evt_b1','pi_b1','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz);
reset role;

set local role service_role;

select is(
  (select paid_through from public.billing_entitlements where owner_id = '55555555-5555-5555-5555-555555555555'),
  '2026-03-02T00:00:00Z'::timestamptz,
  'fixture: pi_a1 (Jan1-Jan31) + pi_a2 stacked on top (Jan31-Mar2) give owner A a Mar2 paid_through'
);

-- ---------------------------------------------------------------------------
-- The core fix: refunding an EARLIER stacked payment never reflows or
-- shortens a LATER, unrelated payment's own already-recorded pass window.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_reversal_event('evt_a1_refund','pi_a1','refund',null,'2026-01-10T00:00:00Z'::timestamptz,1999)$$,
  $$values ('2026-03-02T00:00:00Z'::timestamptz, 'voided_refund', true)$$,
  'refunding pi_a1 voids it but owner A''s paid_through stays at pi_a2''s own recorded Mar2 end, not reflowed to pi_a2''s own purchase time + 30 days'
);
select is(
  (select status from public.billing_payments where payment_id = 'pi_a2'),
  'active',
  'pi_a2 itself is untouched (still active) by pi_a1''s refund'
);

-- ---------------------------------------------------------------------------
-- Refunding the remaining (now most-recent, and only active) payment falls
-- back correctly to null — no naive subtraction, no leftover shadow time.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_reversal_event('evt_a2_refund','pi_a2','refund',null,'2026-01-11T00:00:00Z'::timestamptz,1999)$$,
  $$values (null::timestamptz, 'voided_refund', true)$$,
  'refunding the only remaining active payment drops owner A to no entitlement at all'
);

-- ---------------------------------------------------------------------------
-- Idempotency: an exact-match retry of an already-applied event is a silent
-- no-op; reusing the same event id against a different payment is rejected.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_reversal_event('evt_a1_refund','pi_a1','refund',null,'2026-01-10T00:00:00Z'::timestamptz,1999)$$,
  $$values (null::timestamptz, 'voided_refund', false)$$,
  'retrying the exact same refund event is an idempotent no-op (applied=false)'
);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_a1_refund','pi_b1','refund',null,'2026-01-10T00:00:00Z'::timestamptz,1999)$$,
  'P0001', null,
  'reusing an already-used event id against a different payment is rejected, not silently absorbed'
);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_unknown_payment','pi_does_not_exist','refund',null,now(),1999)$$,
  'P0001', null,
  'a reversal event referencing an unknown payment id is rejected outright'
);

-- ---------------------------------------------------------------------------
-- Owner B: chargeback voids, a won dispute (chargeback_reversed) restores.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_reversal_event('evt_b1_dispute','pi_b1','chargeback','du_b1','2026-01-10T00:00:00Z'::timestamptz,1999)$$,
  $$values (null::timestamptz, 'voided_chargeback', true)$$,
  'a full chargeback voids pi_b1 and owner B loses the entitlement'
);
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_reversal_event('evt_b1_win','pi_b1','chargeback_reversed','du_b1','2026-01-15T00:00:00Z'::timestamptz,1999)$$,
  $$values ('2026-01-31T00:00:00Z'::timestamptz, 'active', true)$$,
  'winning the dispute restores pi_b1''s exact original pass window'
);

-- ---------------------------------------------------------------------------
-- Regression: a full refund is permanent even if a chargeback on the same
-- payment is later reversed (dispute won). Delivered deliberately OUT OF
-- CHRONOLOGICAL ORDER (the reversed-dispute event is applied before the
-- earlier-dated refund arrives) to prove this also holds under out-of-order
-- webhook delivery, not just in-order.
-- ---------------------------------------------------------------------------
select public.billing_apply_reversal_event('evt_b1_dispute2','pi_b1','chargeback','du_b1_second','2026-02-01T00:00:00Z'::timestamptz,1999);
select results_eq(
  $$select status from public.billing_apply_reversal_event('evt_b1_win2','pi_b1','chargeback_reversed','du_b1_second','2026-02-05T00:00:00Z'::timestamptz,1999)$$,
  $$values ('active')$$,
  'second dispute on pi_b1 is won: back to active before the late refund below arrives'
);
select results_eq(
  $$select paid_through, status, applied, anomaly from public.billing_apply_reversal_event('evt_b1_late_refund','pi_b1','refund',null,'2026-01-20T00:00:00Z'::timestamptz,1999)$$,
  $$values (null::timestamptz, 'voided_refund', true, null::text)$$,
  'a refund delivered AFTER a later-occurring, already-applied won dispute still refolds to permanently void pi_b1 (out-of-order delivery + refund permanence)'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '66666666-6666-6666-6666-666666666666'),
  null::timestamptz,
  'owner B has no entitlement after the out-of-order refund permanently voids pi_b1'
);
select results_eq(
  $$select status, applied from public.billing_apply_reversal_event('evt_b1_win3','pi_b1','chargeback_reversed','du_b1_second','2026-02-10T00:00:00Z'::timestamptz,1999)$$,
  $$values ('voided_refund', true)$$,
  'a further chargeback_reversed cannot restore a payment permanently voided by refund: the event is durably recorded (applied=true) but surfaced only as an anomaly, never a restoration'
);

-- ---------------------------------------------------------------------------
-- Partial-amount reversal: no invented policy. Left active, surfaced only
-- as this call's own anomaly text, no ledger/entitlement change.
-- ---------------------------------------------------------------------------
select public.billing_record_checkout('66666666-6666-6666-6666-666666666666','price_fixture',false,'cs_b2',1999,'usd');
select public.billing_apply_verified_payment('66666666-6666-6666-6666-666666666666','cs_b2','evt_b2','pi_b2','price_fixture',false,1999,'usd','2026-03-01T00:00:00Z'::timestamptz);
-- Read applied + anomaly from a SINGLE call: calling the RPC twice with the
-- same event id would hit the idempotent-retry path instead (which always
-- returns anomaly=null, since anomaly text is only computed while an event
-- is actually being folded, not re-derived on a duplicate-delivery no-op).
select results_eq(
  $$select applied, anomaly from public.billing_apply_reversal_event('evt_b2_partial','pi_b2','refund',null,'2026-03-05T00:00:00Z'::timestamptz,400)$$,
  $$values (true, 'Partial refund of 400 against a 1999 payment has no defined entitlement policy; left in its last unambiguous state')$$,
  'a partial refund is durably recorded (applied=true) but surfaced only as this event''s own anomaly text: no invented proportional/void policy'
);
select is(
  (select status from public.billing_payments where payment_id = 'pi_b2'),
  'active',
  'a partial refund does not change the payment status'
);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '66666666-6666-6666-6666-666666666666'),
  '2026-03-31T00:00:00Z'::timestamptz,
  'owner B''s entitlement (from the still-active pi_b2) is unaffected by the partial refund'
);

-- ---------------------------------------------------------------------------
-- Input validation fails closed, before touching any ledger row.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.billing_apply_reversal_event(null,'pi_b2','refund',null,now(),1999)$$,
  'P0001', null, 'a null event id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_bad_kind','pi_b2','dispute_opened',null,now(),1999)$$,
  'P0001', null, 'an unrecognized kind is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_bad_amount','pi_b2','refund',null,now(),0)$$,
  'P0001', null, 'a zero amount is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_bad_time','pi_b2','refund',null,'infinity'::timestamptz,1999)$$,
  'P0001', null, 'a non-finite occurred-at time is rejected'
);

-- ---------------------------------------------------------------------------
-- Dispute identity validation: required non-blank for chargeback/
-- chargeback_reversed, required NULL for refund.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_no_dispute_id','pi_b2','chargeback',null,now(),1999)$$,
  'P0001', null, 'a chargeback event with no dispute id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_no_dispute_id2','pi_b2','chargeback_reversed',null,now(),1999)$$,
  'P0001', null, 'a chargeback_reversed event with no dispute id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_stray_dispute_id','pi_b2','refund','du_should_not_be_here',now(),1999)$$,
  'P0001', null, 'a refund event carrying a dispute id is rejected'
);

-- ---------------------------------------------------------------------------
-- A dispute id belongs to exactly one payment for its entire lifetime.
-- ---------------------------------------------------------------------------
select public.billing_record_checkout('66666666-6666-6666-6666-666666666666','price_fixture',false,'cs_b3',1999,'usd');
select public.billing_apply_verified_payment('66666666-6666-6666-6666-666666666666','cs_b3','evt_b3','pi_b3','price_fixture',false,1999,'usd','2026-04-01T00:00:00Z'::timestamptz);
select public.billing_apply_reversal_event('evt_b2_dispute_claim','pi_b2','chargeback','du_shared_claim','2026-04-05T00:00:00Z'::timestamptz,1999);
select throws_ok(
  $$select * from public.billing_apply_reversal_event('evt_b3_dispute_claim','pi_b3','chargeback','du_shared_claim','2026-04-05T00:00:00Z'::timestamptz,1999)$$,
  'P0001', null,
  'a dispute id already recorded against a different payment is rejected outright'
);

-- ---------------------------------------------------------------------------
-- Dispute identity is authoritative, not event-id/arrival-order: two
-- opposing facts for the SAME dispute, delivered with an identical
-- occurred_at and event ids chosen so lexical order disagrees with the
-- correct outcome, still resolve 'won' regardless of call order.
-- ---------------------------------------------------------------------------
select public.billing_record_checkout('77777777-7777-7777-7777-777777777777','price_fixture',false,'cs_c1',1999,'usd');
select public.billing_apply_verified_payment('77777777-7777-7777-7777-777777777777','cs_c1','evt_c1','pi_c1','price_fixture',false,1999,'usd','2026-03-01T00:00:00Z'::timestamptz);
select public.billing_apply_reversal_event('evt_c1_zz_created','pi_c1','chargeback','du_c_tie1','2026-04-01T00:00:00Z'::timestamptz,1999);
select results_eq(
  $$select paid_through, status from public.billing_apply_reversal_event('evt_c1_aa_reversed','pi_c1','chargeback_reversed','du_c_tie1','2026-04-01T00:00:00Z'::timestamptz,1999)$$,
  $$values ('2026-03-31T00:00:00Z'::timestamptz, 'active')$$,
  'a won dispute resolves active even though its own event id (''evt_c1_aa_reversed'') sorts lexically BEFORE the chargeback''s (''evt_c1_zz_created'') at an identical occurred_at'
);

-- The stronger case: the 'won' fact is durably recorded BEFORE the
-- 'created' fact even exists yet (not just a same-timestamp tie — a
-- genuinely out-of-order delivery). The first call correctly has nothing to
-- restore yet (surfaced as its own anomaly); once the chargeback fact
-- arrives, the SAME dispute id resolves the payment to 'active', proving the
-- final state depends on the complete SET of facts, never on which one
-- happened to be recorded first.
select public.billing_record_checkout('77777777-7777-7777-7777-777777777777','price_fixture',false,'cs_c2',1999,'usd');
select public.billing_apply_verified_payment('77777777-7777-7777-7777-777777777777','cs_c2','evt_c2','pi_c2','price_fixture',false,1999,'usd','2026-05-01T00:00:00Z'::timestamptz);
select results_eq(
  $$select status, anomaly from public.billing_apply_reversal_event('evt_c2_reversed_first','pi_c2','chargeback_reversed','du_c_tie2','2026-06-01T00:00:00Z'::timestamptz,1999)$$,
  $$values ('active', 'chargeback_reversed with no matching chargeback for dispute du_c_tie2; ignored')$$,
  'a chargeback_reversed delivered with no chargeback fact recorded yet is an orphan, surfaced as this call''s own anomaly, and changes nothing'
);
select results_eq(
  $$select paid_through, status from public.billing_apply_reversal_event('evt_c2_created_second','pi_c2','chargeback','du_c_tie2','2026-06-01T00:00:00Z'::timestamptz,1999)$$,
  $$values ('2026-05-31T00:00:00Z'::timestamptz, 'active')$$,
  'once the chargeback fact for the SAME dispute id arrives, the payment resolves active — the earlier-recorded won fact was not lost'
);

-- ---------------------------------------------------------------------------
-- Multiple independent disputes on one payment: it stays voided until EVERY
-- dispute raised against it has resolved won.
-- ---------------------------------------------------------------------------
select public.billing_record_checkout('77777777-7777-7777-7777-777777777777','price_fixture',false,'cs_c3',1999,'usd');
select public.billing_apply_verified_payment('77777777-7777-7777-7777-777777777777','cs_c3','evt_c3','pi_c3','price_fixture',false,1999,'usd','2026-07-01T00:00:00Z'::timestamptz);
select public.billing_apply_reversal_event('evt_c3_a_created','pi_c3','chargeback','du_c3_a','2026-08-01T00:00:00Z'::timestamptz,1999);
select public.billing_apply_reversal_event('evt_c3_b_created','pi_c3','chargeback','du_c3_b','2026-08-02T00:00:00Z'::timestamptz,1999);
select results_eq(
  $$select status from public.billing_apply_reversal_event('evt_c3_b_won','pi_c3','chargeback_reversed','du_c3_b','2026-08-03T00:00:00Z'::timestamptz,1999)$$,
  $$values ('voided_chargeback')$$,
  'winning ONE of two disputes on the same payment leaves it voided while the other dispute remains unresolved'
);
select results_eq(
  $$select status from public.billing_apply_reversal_event('evt_c3_a_won','pi_c3','chargeback_reversed','du_c3_a','2026-08-04T00:00:00Z'::timestamptz,1999)$$,
  $$values ('active')$$,
  'winning EVERY dispute raised against the payment fully restores it'
);

-- ---------------------------------------------------------------------------
-- A one-time-pass reversal must never erase entitlement independently
-- granted by a subscription invoice (public.billing_subscription_invoices,
-- 20260920020000_recurring_billing.sql). Before this fix, paid_through was
-- recomputed as max(pass_ended_at) over billing_payments ALONE, silently
-- dropping to a subscriber's subscription-granted time whenever an unrelated
-- one-time pass they also held was reversed.
-- ---------------------------------------------------------------------------
select public.billing_record_subscription('88888888-8888-8888-8888-888888888888','sub_d1','price_recurring',false,'active');
select public.billing_apply_subscription_invoice('sub_d1','in_d1','88888888-8888-8888-8888-888888888888','price_recurring',false,1999,'usd','2026-05-01T00:00:00Z'::timestamptz,'2026-06-01T00:00:00Z'::timestamptz,'2026-05-01T00:00:00Z'::timestamptz);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '88888888-8888-8888-8888-888888888888'),
  '2026-06-01T00:00:00Z'::timestamptz,
  'fixture: owner D''s subscription invoice alone grants paid_through through Jun1'
);
select public.billing_record_checkout('88888888-8888-8888-8888-888888888888','price_fixture',false,'cs_d1',1999,'usd');
select public.billing_apply_verified_payment('88888888-8888-8888-8888-888888888888','cs_d1','evt_d1','pi_d1','price_fixture',false,1999,'usd','2026-05-10T00:00:00Z'::timestamptz);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '88888888-8888-8888-8888-888888888888'),
  '2026-07-01T00:00:00Z'::timestamptz,
  'fixture: owner D''s manual pass stacks on top of the subscription''s own Jun1 grant, giving Jul1'
);
-- An invoice processed while the manual pass is active records the combined
-- account expiry. That snapshot must not become an independent grant.
select public.billing_apply_subscription_invoice('sub_d1','in_d2','88888888-8888-8888-8888-888888888888','price_recurring',false,1999,'usd','2026-05-01T00:00:00Z'::timestamptz,'2026-06-01T00:00:00Z'::timestamptz,'2026-05-12T00:00:00Z'::timestamptz);
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_reversal_event('evt_d1_refund','pi_d1','refund',null,'2026-05-15T00:00:00Z'::timestamptz,1999)$$,
  $$values ('2026-06-01T00:00:00Z'::timestamptz, 'voided_refund', true)$$,
  'refunding owner D''s one-time pass falls back to the subscription''s own granted Jun1 paid_through — never erased to null'
);

reset role;
select * from finish();
rollback;
