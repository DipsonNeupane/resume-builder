begin;
select plan(23);
insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002');
set local role service_role;

-- 1-2: reserving a fresh owner creates the row, owned by the caller's own request.
select is(
  (public.billing_reserve_owner_checkout('manual','11111111-0000-0000-0000-000000000001'::uuid,'aaaaaaaa-0000-0000-0000-000000000001','price_fixture',false)).request_id,
  '11111111-0000-0000-0000-000000000001'::uuid,
  'first reservation is created for the requesting owner'
);
select is(
  (public.billing_reserve_owner_checkout('manual','11111111-0000-0000-0000-000000000001'::uuid,'aaaaaaaa-0000-0000-0000-000000000001','price_fixture',false)).session_id,
  null,
  'a fresh reservation has no session bound yet'
);

-- 3: retrying the SAME request id/kind is idempotent, not a conflict.
select is(
  (public.billing_reserve_owner_checkout('manual','11111111-0000-0000-0000-000000000001'::uuid,'aaaaaaaa-0000-0000-0000-000000000001','price_fixture',false)).request_id,
  '11111111-0000-0000-0000-000000000001'::uuid,
  'retrying the same request id returns the same reservation, not a conflict'
);

-- 4-5: a DIFFERENT request/kind for the same owner is handed back someone else's row
-- (the caller must compare kind/request_id itself; the RPC never throws on conflict).
select is(
  (public.billing_reserve_owner_checkout('subscription','22222222-0000-0000-0000-000000000002'::uuid,'aaaaaaaa-0000-0000-0000-000000000001','price_recurring',false)).request_id,
  '11111111-0000-0000-0000-000000000001'::uuid,
  'a competing subscription reservation for the same owner sees the existing manual reservation, not its own'
);
select is(
  (public.billing_reserve_owner_checkout('subscription','22222222-0000-0000-0000-000000000002'::uuid,'aaaaaaaa-0000-0000-0000-000000000001','price_recurring',false)).kind,
  'manual',
  'the conflicting reservation reports its true kind so the caller can tell it is not its own'
);

-- 6: owner isolation — a different owner is unaffected and gets its own row.
select is(
  (public.billing_reserve_owner_checkout('subscription','33333333-0000-0000-0000-000000000003'::uuid,'aaaaaaaa-0000-0000-0000-000000000002','price_recurring',false)).request_id,
  '33333333-0000-0000-0000-000000000003'::uuid,
  'a different owner reserves independently, unaffected by owner ones lock'
);

-- 7-9: binding.
select lives_ok(
  $$select public.billing_bind_owner_checkout('aaaaaaaa-0000-0000-0000-000000000001','manual','11111111-0000-0000-0000-000000000001','cs_fixture_1')$$,
  'binding the owners own reservation succeeds'
);
select is(
  (public.billing_reserve_owner_checkout('manual','11111111-0000-0000-0000-000000000001'::uuid,'aaaaaaaa-0000-0000-0000-000000000001','price_fixture',false)).session_id,
  'cs_fixture_1',
  'the bound session id is now on file'
);
select lives_ok(
  $$select public.billing_bind_owner_checkout('aaaaaaaa-0000-0000-0000-000000000001','manual','11111111-0000-0000-0000-000000000001','cs_fixture_1')$$,
  'rebinding the identical session id is an idempotent no-op'
);
select throws_ok(
  $$select public.billing_bind_owner_checkout('aaaaaaaa-0000-0000-0000-000000000001','manual','11111111-0000-0000-0000-000000000001','cs_other')$$,
  'P0001','Checkout reservation already bound to a different session',
  'a second, different Stripe session can never be bound onto the same reservation'
);
select throws_ok(
  $$select public.billing_bind_owner_checkout('aaaaaaaa-0000-0000-0000-000000000002','subscription','11111111-0000-0000-0000-000000000001','cs_wrong_owner')$$,
  'P0001','Invalid checkout reservation binding',
  'binding cannot be forged under the wrong owner/kind/request id'
);

-- 12-14: release by session id (the provider-confirmed webhook path) is precise and idempotent.
select is(
  public.billing_release_owner_checkout('aaaaaaaa-0000-0000-0000-000000000001','manual','cs_wrong_session',null),
  false,
  'releasing by a session id that does not match the bound one is a safe no-op, not a forced release'
);
select is(
  public.billing_release_owner_checkout('aaaaaaaa-0000-0000-0000-000000000001','subscription','cs_fixture_1',null),
  false,
  'releasing under the wrong kind is a safe no-op'
);
select is(
  public.billing_release_owner_checkout('aaaaaaaa-0000-0000-0000-000000000001','manual','cs_fixture_1',null),
  true,
  'releasing by the exact bound session id succeeds'
);
select is(
  public.billing_release_owner_checkout('aaaaaaaa-0000-0000-0000-000000000001','manual','cs_fixture_1',null),
  false,
  'releasing an already-released reservation is a safe idempotent no-op (webhook redelivery)'
);

-- 16: the slot is now free — a genuinely new kind/request can reserve it.
select is(
  (public.billing_reserve_owner_checkout('subscription','44444444-0000-0000-0000-000000000004'::uuid,'aaaaaaaa-0000-0000-0000-000000000001','price_recurring',false)).request_id,
  '44444444-0000-0000-0000-000000000004'::uuid,
  'once released, the owner can start a new (subscription) checkout'
);

-- 17-19: release by request id (the provably-safe-unbound path) only applies to an
-- UNBOUND reservation and only for the exact matching request id.
select is(
  public.billing_release_owner_checkout('aaaaaaaa-0000-0000-0000-000000000001','subscription',null,'99999999-0000-0000-0000-000000000009'::uuid),
  false,
  'releasing by the wrong request id on an unbound reservation is a safe no-op'
);
select is(
  public.billing_release_owner_checkout('aaaaaaaa-0000-0000-0000-000000000001','subscription',null,'44444444-0000-0000-0000-000000000004'::uuid),
  true,
  'an unbound reservation can be released by its own exact request id once proven safe'
);
select lives_ok(
  $$select public.billing_bind_owner_checkout('aaaaaaaa-0000-0000-0000-000000000002','subscription','33333333-0000-0000-0000-000000000003','cs_owner_two')$$,
  'setup: bind owner twos reservation before proving request-id release refuses a bound row'
);
select is(
  public.billing_release_owner_checkout('aaaaaaaa-0000-0000-0000-000000000002','subscription',null,'33333333-0000-0000-0000-000000000003'::uuid),
  false,
  'request-id release never applies to an already-bound reservation, even with a matching request id'
);

-- 21: invalid input — exactly one of p_session/p_request_id is required.
select throws_ok(
  $$select public.billing_release_owner_checkout('aaaaaaaa-0000-0000-0000-000000000002','subscription','cs_owner_two','33333333-0000-0000-0000-000000000003')$$,
  'P0001','Invalid checkout reservation release',
  'supplying both a session and a request id is rejected, not silently resolved'
);

-- 22-23: cross-role denial.
reset role;
set local role authenticated;
select throws_ok(
  $$select public.billing_reserve_owner_checkout('manual','55555555-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','price_fixture',false)$$,
  '42501','permission denied for function billing_reserve_owner_checkout',
  'the browser cannot reserve a checkout slot directly'
);
select throws_ok(
  $$select * from public.billing_owner_checkout_locks$$,
  '42501','permission denied for table billing_owner_checkout_locks',
  'the browser cannot read reservation state directly'
);
reset role;

select * from finish();
rollback;
