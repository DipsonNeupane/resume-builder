-- pgTAP tests for supabase/migrations/20260920060000_recurring_invoice_reversals.sql.
--
-- Run locally without Docker: npm run test:db (see scripts/test-database.mjs
-- for the PGlite/Postgres harness). Same caveat as every other file here:
-- this harness does not cover hosted Auth/PostgREST/webhook configuration or
-- true multi-connection concurrency.
--
-- Fixtures use the existing, already-tested billing_record_subscription /
-- billing_apply_subscription_invoice / billing_record_checkout /
-- billing_apply_verified_payment RPCs to create real rows, then exercise
-- this migration's new RPCs against them — never inserting into
-- billing_subscription_invoices/billing_payments/billing_entitlements
-- directly.

begin;
select plan(46);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('10101010-1010-1010-1010-101010101010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invoice-rev-e@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('20202020-2020-2020-2020-202020202020', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invoice-rev-f@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('30303030-3030-3030-3030-303030303030', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invoice-rev-h@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('40404040-4040-4040-4040-404040404040', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invoice-rev-i@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('50505050-5050-5050-5050-505050505050', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invoice-rev-m@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false);

-- ---------------------------------------------------------------------------
-- Access control: neither anon nor a signed-in browser session can read the
-- new reversal ledger tables or call any of the three new RPCs.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub to '10101010-1010-1010-1010-101010101010';
set local request.jwt.claims to '{"sub":"10101010-1010-1010-1010-101010101010","role":"authenticated"}';
select throws_ok(
  $$select * from public.billing_subscription_invoice_reversal_events$$, '42501', null,
  'authenticated cannot read billing_subscription_invoice_reversal_events'
);
select throws_ok(
  $$select * from public.billing_subscription_invoice_reversal_disputes$$, '42501', null,
  'authenticated cannot read billing_subscription_invoice_reversal_disputes'
);
select throws_ok(
  $$select public.billing_record_subscription_invoice_payment_intent('in_forged','pi_forged')$$, '42501', null,
  'authenticated cannot call billing_record_subscription_invoice_payment_intent'
);
select throws_ok(
  $$select public.billing_lookup_reversal_target('pi_forged')$$, '42501', null,
  'authenticated cannot call billing_lookup_reversal_target'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_forged','pi_forged','refund',null,now(),1999)$$,
  '42501', null,
  'authenticated cannot call billing_apply_subscription_invoice_reversal_event'
);
reset role;
set local role anon;
select throws_ok(
  $$select * from public.billing_subscription_invoice_reversal_events$$, '42501', null,
  'anon cannot read billing_subscription_invoice_reversal_events'
);
select throws_ok(
  $$select * from public.billing_subscription_invoice_reversal_disputes$$, '42501', null,
  'anon cannot read billing_subscription_invoice_reversal_disputes'
);
select throws_ok(
  $$select public.billing_record_subscription_invoice_payment_intent('in_forged','pi_forged')$$, '42501', null,
  'anon cannot call billing_record_subscription_invoice_payment_intent'
);
select throws_ok(
  $$select public.billing_lookup_reversal_target('pi_forged')$$, '42501', null,
  'anon cannot call billing_lookup_reversal_target'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_forged','pi_forged','refund',null,now(),1999)$$,
  '42501', null,
  'anon cannot call billing_apply_subscription_invoice_reversal_event'
);
reset role;

set local role service_role;

-- ---------------------------------------------------------------------------
-- Owner E: the durable payment_intent -> invoice -> owner mapping itself.
-- ---------------------------------------------------------------------------
select public.billing_record_subscription('10101010-1010-1010-1010-101010101010','sub_e1','price_recurring',false,'active');
select public.billing_apply_subscription_invoice('sub_e1','in_e1','10101010-1010-1010-1010-101010101010','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-02-01T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz);
select public.billing_apply_subscription_invoice('sub_e1','in_e2','10101010-1010-1010-1010-101010101010','price_recurring',false,1999,'usd','2026-02-01T00:00:00Z'::timestamptz,'2026-03-01T00:00:00Z'::timestamptz,'2026-02-01T00:00:00Z'::timestamptz);
select public.billing_record_failed_subscription_invoice('sub_e1','in_e1_failed','10101010-1010-1010-1010-101010101010','usd','2026-01-02T00:00:00Z'::timestamptz);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '10101010-1010-1010-1010-101010101010'),
  '2026-03-01T00:00:00Z'::timestamptz,
  'fixture: owner E has two granted invoices, in_e2''s Mar1 is the current ceiling'
);

select lives_ok(
  $$select public.billing_record_subscription_invoice_payment_intent('in_e1','pi_e1')$$,
  'binding a granted invoice to its own settled payment intent succeeds'
);
select lives_ok(
  $$select public.billing_record_subscription_invoice_payment_intent('in_e1','pi_e1')$$,
  'rebinding the same invoice to the identical payment intent is an idempotent no-op'
);
select throws_ok(
  $$select public.billing_record_subscription_invoice_payment_intent('in_e1','pi_e1_different')$$,
  'P0001', null,
  'rebinding an already-bound invoice to a DIFFERENT payment intent is rejected'
);
select throws_ok(
  $$select public.billing_record_subscription_invoice_payment_intent('in_does_not_exist','pi_x')$$,
  'P0001', null,
  'binding an unknown invoice id is rejected'
);
select throws_ok(
  $$select public.billing_record_subscription_invoice_payment_intent('in_e1_failed','pi_y')$$,
  'P0001', null,
  'a failed (never-paid) invoice can never be bound to a payment intent'
);
select throws_ok(
  $$select public.billing_record_subscription_invoice_payment_intent('in_e2','pi_e1')$$,
  '23505', null,
  'the same payment intent can never be bound to two different invoices (real unique-constraint concurrency guarantee)'
);

select is(public.billing_lookup_reversal_target('pi_e1'), 'subscription', 'lookup correctly identifies a subscription-invoice payment intent');
select ok(public.billing_lookup_reversal_target('pi_does_not_exist_anywhere') is null, 'lookup returns null for a payment intent in neither domain');

select public.billing_record_checkout('50505050-5050-5050-5050-505050505050','price_fixture',false,'cs_m1',1999,'usd');
select public.billing_apply_verified_payment('50505050-5050-5050-5050-505050505050','cs_m1','evt_m1','pi_manual1','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz);
select is(public.billing_lookup_reversal_target('pi_manual1'), 'manual', 'lookup correctly identifies a one-time-pass payment intent, never confusing it with the subscription domain');

-- ---------------------------------------------------------------------------
-- Owner F: full refund, chargeback + won dispute, permanence over a later
-- dispute win, partial-amount anomaly, and the same input-validation/
-- dispute-identity-exclusivity rules the one-time-pass RPC already enforces.
-- ---------------------------------------------------------------------------
select public.billing_record_subscription('20202020-2020-2020-2020-202020202020','sub_f1','price_recurring',false,'active');
select public.billing_apply_subscription_invoice('sub_f1','in_f1','20202020-2020-2020-2020-202020202020','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-02-01T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz);
select public.billing_record_subscription_invoice_payment_intent('in_f1','pi_f1');
select is(
  (select paid_through from public.billing_entitlements where owner_id = '20202020-2020-2020-2020-202020202020'),
  '2026-02-01T00:00:00Z'::timestamptz,
  'fixture: owner F''s first invoice grants Feb1'
);

select results_eq(
  $$select paid_through, status, applied from public.billing_apply_subscription_invoice_reversal_event('evt_f1_refund','pi_f1','refund',null,'2026-01-10T00:00:00Z'::timestamptz,1999)$$,
  $$values (null::timestamptz, 'voided_refund', true)$$,
  'a full refund of the only granted invoice voids it and drops owner F to no entitlement'
);
select is(
  (select status from public.billing_subscription_invoices where invoice_id = 'in_f1'),
  'voided_refund',
  'in_f1''s own status column reflects the void'
);
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_subscription_invoice_reversal_event('evt_f1_refund','pi_f1','refund',null,'2026-01-10T00:00:00Z'::timestamptz,1999)$$,
  $$values (null::timestamptz, 'voided_refund', false)$$,
  'retrying the exact same refund event is an idempotent no-op (applied=false)'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_f1_refund','pi_f2_does_not_exist_yet','refund',null,'2026-01-10T00:00:00Z'::timestamptz,1999)$$,
  'P0001', null,
  'reusing an already-used event id against a different payment intent is rejected, not silently absorbed'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_unknown','pi_does_not_exist','refund',null,now(),1999)$$,
  'P0001', null,
  'a reversal event referencing an unknown subscription invoice payment intent is rejected outright'
);

select public.billing_apply_subscription_invoice('sub_f1','in_f2','20202020-2020-2020-2020-202020202020','price_recurring',false,1999,'usd','2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz,'2026-03-01T00:00:00Z'::timestamptz);
select public.billing_record_subscription_invoice_payment_intent('in_f2','pi_f2');
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_subscription_invoice_reversal_event('evt_f2_dispute','pi_f2','chargeback','du_f2','2026-03-10T00:00:00Z'::timestamptz,1999)$$,
  $$values (null::timestamptz, 'voided_chargeback', true)$$,
  'a full chargeback voids in_f2; in_f1 is permanently voided already, so owner F has no entitlement at all'
);
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_subscription_invoice_reversal_event('evt_f2_win','pi_f2','chargeback_reversed','du_f2','2026-03-15T00:00:00Z'::timestamptz,1999)$$,
  $$values ('2026-04-01T00:00:00Z'::timestamptz, 'active', true)$$,
  'winning the dispute restores in_f2''s own recorded Apr1 period end'
);

select public.billing_apply_subscription_invoice('sub_f1','in_f3','20202020-2020-2020-2020-202020202020','price_recurring',false,1999,'usd','2026-05-01T00:00:00Z'::timestamptz,'2026-06-01T00:00:00Z'::timestamptz,'2026-05-01T00:00:00Z'::timestamptz);
select public.billing_record_subscription_invoice_payment_intent('in_f3','pi_f3');
select public.billing_apply_subscription_invoice_reversal_event('evt_f3_dispute','pi_f3','chargeback','du_f3','2026-05-10T00:00:00Z'::timestamptz,1999);
select public.billing_apply_subscription_invoice_reversal_event('evt_f3_refund','pi_f3','refund',null,'2026-05-12T00:00:00Z'::timestamptz,1999);
select results_eq(
  $$select status, applied from public.billing_apply_subscription_invoice_reversal_event('evt_f3_win','pi_f3','chargeback_reversed','du_f3','2026-05-15T00:00:00Z'::timestamptz,1999)$$,
  $$values ('voided_refund', true)$$,
  'a full refund is permanent even after: winning a dispute on the SAME invoice can never restore it once separately refunded'
);

select public.billing_apply_subscription_invoice('sub_f1','in_f4','20202020-2020-2020-2020-202020202020','price_recurring',false,1999,'usd','2026-07-01T00:00:00Z'::timestamptz,'2026-08-01T00:00:00Z'::timestamptz,'2026-07-01T00:00:00Z'::timestamptz);
select public.billing_record_subscription_invoice_payment_intent('in_f4','pi_f4');
select results_eq(
  $$select applied, anomaly from public.billing_apply_subscription_invoice_reversal_event('evt_f4_partial','pi_f4','refund',null,'2026-07-10T00:00:00Z'::timestamptz,400)$$,
  $$values (true, 'Partial refund of 400 against a 1999 subscription invoice payment has no defined entitlement policy; left in its last unambiguous state')$$,
  'a partial refund is durably recorded (applied=true) but surfaced only as this event''s own anomaly text: no invented proportional/void policy'
);
select is(
  (select status from public.billing_subscription_invoices where invoice_id = 'in_f4'),
  'active',
  'a partial refund does not change the invoice status'
);

select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event(null,'pi_f4','refund',null,now(),1999)$$,
  'P0001', null, 'a null event id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_bad_kind','pi_f4','dispute_opened',null,now(),1999)$$,
  'P0001', null, 'an unrecognized kind is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_bad_amount','pi_f4','refund',null,now(),0)$$,
  'P0001', null, 'a zero amount is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_bad_time','pi_f4','refund',null,'infinity'::timestamptz,1999)$$,
  'P0001', null, 'a non-finite occurred-at time is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_no_dispute_id','pi_f4','chargeback',null,now(),1999)$$,
  'P0001', null, 'a chargeback event with no dispute id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_no_dispute_id2','pi_f4','chargeback_reversed',null,now(),1999)$$,
  'P0001', null, 'a chargeback_reversed event with no dispute id is rejected'
);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_stray_dispute_id','pi_f4','refund','du_should_not_be_here',now(),1999)$$,
  'P0001', null, 'a refund event carrying a dispute id is rejected'
);

select public.billing_apply_subscription_invoice('sub_f1','in_f5','20202020-2020-2020-2020-202020202020','price_recurring',false,1999,'usd','2026-09-01T00:00:00Z'::timestamptz,'2026-10-01T00:00:00Z'::timestamptz,'2026-09-01T00:00:00Z'::timestamptz);
select public.billing_record_subscription_invoice_payment_intent('in_f5','pi_f5');
select public.billing_apply_subscription_invoice_reversal_event('evt_f4_dispute_claim','pi_f4','chargeback','du_shared_claim','2026-09-05T00:00:00Z'::timestamptz,1999);
select throws_ok(
  $$select * from public.billing_apply_subscription_invoice_reversal_event('evt_f5_dispute_claim','pi_f5','chargeback','du_shared_claim','2026-09-05T00:00:00Z'::timestamptz,1999)$$,
  'P0001', null,
  'a dispute id already recorded against a different subscription invoice is rejected outright'
);

-- ---------------------------------------------------------------------------
-- Owner H: the reason billing_apply_reversal_event is REDEFINED by this
-- migration. Voiding a subscription invoice must stop it from counting
-- toward paid_through when a SEPARATE, unrelated one-time-pass reversal
-- event later triggers billing_apply_reversal_event's own recomputation.
-- ---------------------------------------------------------------------------
select public.billing_record_subscription('30303030-3030-3030-3030-303030303030','sub_h1','price_recurring',false,'active');
select public.billing_apply_subscription_invoice('sub_h1','in_h1','30303030-3030-3030-3030-303030303030','price_recurring',false,1999,'usd','2026-05-01T00:00:00Z'::timestamptz,'2026-06-01T00:00:00Z'::timestamptz,'2026-05-01T00:00:00Z'::timestamptz);
select public.billing_record_subscription_invoice_payment_intent('in_h1','pi_h_sub');
select is(
  (select paid_through from public.billing_entitlements where owner_id = '30303030-3030-3030-3030-303030303030'),
  '2026-06-01T00:00:00Z'::timestamptz,
  'fixture: owner H''s subscription invoice alone grants paid_through through Jun1'
);
select public.billing_record_checkout('30303030-3030-3030-3030-303030303030','price_fixture',false,'cs_h1',1999,'usd');
select public.billing_apply_verified_payment('30303030-3030-3030-3030-303030303030','cs_h1','evt_h1','pi_h_manual','price_fixture',false,1999,'usd','2026-05-10T00:00:00Z'::timestamptz);
select is(
  (select paid_through from public.billing_entitlements where owner_id = '30303030-3030-3030-3030-303030303030'),
  '2026-07-01T00:00:00Z'::timestamptz,
  'fixture: owner H''s manual pass stacks on top of the subscription''s own Jun1 grant, giving Jul1'
);
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_subscription_invoice_reversal_event('evt_h_sub_refund','pi_h_sub','refund',null,'2026-05-15T00:00:00Z'::timestamptz,1999)$$,
  $$values ('2026-07-01T00:00:00Z'::timestamptz, 'voided_refund', true)$$,
  'refunding owner H''s subscription invoice falls back to the manual pass''s own unaffected Jul1 window'
);
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_reversal_event('evt_h_manual_refund','pi_h_manual','refund',null,'2026-05-20T00:00:00Z'::timestamptz,1999)$$,
  $$values (null::timestamptz, 'voided_refund', true)$$,
  'refunding the manual pass after its subscription invoice was already voided drops owner H to NO entitlement -- the voided invoice''s Jun1 period_end must not resurrect via billing_apply_reversal_event''s own recomputation (the exact regression this migration''s redefinition of that function fixes)'
);

-- ---------------------------------------------------------------------------
-- Owner I: voiding one subscription invoice must fall back to a SURVIVING
-- invoice's own INDEPENDENT period_end, never that survivor's own recorded
-- granted_paid_through SNAPSHOT (which can already reflect a combined
-- ceiling set by the very invoice being voided).
-- ---------------------------------------------------------------------------
select public.billing_record_subscription('40404040-4040-4040-4040-404040404040','sub_i1','price_recurring',false,'active');
select public.billing_apply_subscription_invoice('sub_i1','in_i1','40404040-4040-4040-4040-404040404040','price_recurring',false,1999,'usd','2026-01-01T00:00:00Z'::timestamptz,'2026-02-01T00:00:00Z'::timestamptz,'2026-01-01T00:00:00Z'::timestamptz);
select public.billing_record_subscription('40404040-4040-4040-4040-404040404040','sub_i2','price_recurring',false,'active');
-- An out-of-order-arriving OLDER cycle: its own period_end (Jan15) is
-- earlier than the owner's current paid_through (Feb1, from in_i1), so
-- greatest() records granted_paid_through = Feb1 for in_i2 too, even though
-- in_i2's OWN period only ever covered up to Jan15.
select public.billing_apply_subscription_invoice('sub_i2','in_i2','40404040-4040-4040-4040-404040404040','price_recurring',false,1999,'usd','2025-12-15T00:00:00Z'::timestamptz,'2026-01-15T00:00:00Z'::timestamptz,'2026-01-02T00:00:00Z'::timestamptz);
select is(
  (select granted_paid_through from public.billing_subscription_invoices where invoice_id = 'in_i2'),
  '2026-02-01T00:00:00Z'::timestamptz,
  'fixture: in_i2''s recorded granted_paid_through SNAPSHOT equals the combined Feb1 ceiling, not its own Jan15 period end'
);
select public.billing_record_subscription_invoice_payment_intent('in_i1','pi_i1');
select public.billing_record_subscription_invoice_payment_intent('in_i2','pi_i2');
select results_eq(
  $$select paid_through, status, applied from public.billing_apply_subscription_invoice_reversal_event('evt_i1_refund','pi_i1','refund',null,'2026-01-10T00:00:00Z'::timestamptz,1999)$$,
  $$values ('2026-01-15T00:00:00Z'::timestamptz, 'voided_refund', true)$$,
  'voiding in_i1 falls back to in_i2''s own INDEPENDENT period_end (Jan15), never in_i2''s own granted_paid_through SNAPSHOT (Feb1), which would incorrectly resurrect in_i1''s just-voided contribution'
);
select is(
  (select status from public.billing_subscription_invoices where invoice_id = 'in_i2'),
  'active',
  'the unrelated, surviving invoice in_i2 is completely untouched by voiding in_i1'
);

reset role;
select * from finish();
rollback;
