begin;
select plan(9);
insert into auth.users(id) values ('88888888-8888-8888-8888-888888888888'),('99999999-9999-9999-9999-999999999999');
set local role service_role;

-- boundary: exactly 20 attempts allowed within the window, the 21st is rejected
select lives_ok(
  $$select public.billing_throttle_checkout_attempt('88888888-8888-8888-8888-888888888888') from generate_series(1,20)$$,
  'first 20 attempts in the window succeed'
);
select throws_ok(
  $$select public.billing_throttle_checkout_attempt('88888888-8888-8888-8888-888888888888')$$,
  '54000','Too many checkout attempts. Wait up to an hour and try again.',
  '21st attempt within the window is rejected'
);

-- per-owner independence: a second owner is unaffected by the first owner's exhausted window
select lives_ok(
  $$select public.billing_throttle_checkout_attempt('99999999-9999-9999-9999-999999999999')$$,
  'a different owner has an independent counter, unaffected by owner one being throttled'
);
select throws_ok(
  $$select public.billing_throttle_checkout_attempt('88888888-8888-8888-8888-888888888888')$$,
  '54000','Too many checkout attempts. Wait up to an hour and try again.',
  'first owner remains throttled after the second owner succeeded'
);

-- reset: once the window elapses, the counter restarts at a fresh window rather than
-- staying capped forever (bounded storage: same row is reused, never a growing ledger)
reset role;
update public.billing_checkout_attempts set window_start = now() - interval '2 hours' where owner_id='88888888-8888-8888-8888-888888888888';
set local role service_role;
select lives_ok(
  $$select public.billing_throttle_checkout_attempt('88888888-8888-8888-8888-888888888888') from generate_series(1,20)$$,
  '20 more attempts succeed once the window has elapsed, proving a full reset, not a fluke pass'
);
select throws_ok(
  $$select public.billing_throttle_checkout_attempt('88888888-8888-8888-8888-888888888888')$$,
  '54000','Too many checkout attempts. Wait up to an hour and try again.',
  'the reset window enforces its own fresh 20-attempt boundary'
);

-- invalid input
select throws_ok(
  $$select public.billing_throttle_checkout_attempt(null)$$,
  '22023','Invalid checkout attempt',
  'a null owner is rejected'
);

-- cross-role denial: the browser (authenticated/anon) role can neither call the RPC nor
-- read the counters directly
set local role authenticated;
select throws_ok(
  $$select public.billing_throttle_checkout_attempt('88888888-8888-8888-8888-888888888888')$$,
  '42501','permission denied for function billing_throttle_checkout_attempt',
  'browser cannot throttle on its own behalf'
);
select throws_ok(
  $$select * from public.billing_checkout_attempts$$,
  '42501','permission denied for table billing_checkout_attempts',
  'browser cannot read attempt counters'
);
reset role;

select * from finish();
rollback;
