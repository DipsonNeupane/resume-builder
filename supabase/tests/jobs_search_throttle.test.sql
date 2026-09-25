begin;
select plan(9);
insert into auth.users(id) values ('77777777-7777-7777-7777-777777777777'),('66666666-6666-6666-6666-666666666666');
set local role service_role;

-- boundary: exactly 40 attempts allowed within the window, the 41st is rejected
select lives_ok(
  $$select public.jobs_throttle_search_attempt('77777777-7777-7777-7777-777777777777') from generate_series(1,40)$$,
  'first 40 attempts in the window succeed'
);
select throws_ok(
  $$select public.jobs_throttle_search_attempt('77777777-7777-7777-7777-777777777777')$$,
  '54000','Too many job searches. Wait a few minutes and try again.',
  '41st attempt within the window is rejected'
);

-- per-owner independence: a second owner is unaffected by the first owner's exhausted window
select lives_ok(
  $$select public.jobs_throttle_search_attempt('66666666-6666-6666-6666-666666666666')$$,
  'a different owner has an independent counter, unaffected by owner one being throttled'
);
select throws_ok(
  $$select public.jobs_throttle_search_attempt('77777777-7777-7777-7777-777777777777')$$,
  '54000','Too many job searches. Wait a few minutes and try again.',
  'first owner remains throttled after the second owner succeeded'
);

-- reset: once the window elapses, the counter restarts at a fresh window rather than
-- staying capped forever (bounded storage: same row is reused, never a growing ledger)
reset role;
update public.jobs_search_attempts set window_start = now() - interval '20 minutes' where owner_id='77777777-7777-7777-7777-777777777777';
set local role service_role;
select lives_ok(
  $$select public.jobs_throttle_search_attempt('77777777-7777-7777-7777-777777777777') from generate_series(1,40)$$,
  '40 more attempts succeed once the window has elapsed, proving a full reset, not a fluke pass'
);
select throws_ok(
  $$select public.jobs_throttle_search_attempt('77777777-7777-7777-7777-777777777777')$$,
  '54000','Too many job searches. Wait a few minutes and try again.',
  'the reset window enforces its own fresh 40-attempt boundary'
);

-- invalid input
select throws_ok(
  $$select public.jobs_throttle_search_attempt(null)$$,
  '22023','Invalid job search attempt',
  'a null owner is rejected'
);

-- cross-role denial: the browser (authenticated/anon) role can neither call the RPC nor
-- read the counters directly
set local role authenticated;
select throws_ok(
  $$select public.jobs_throttle_search_attempt('77777777-7777-7777-7777-777777777777')$$,
  '42501','permission denied for function jobs_throttle_search_attempt',
  'browser cannot throttle on its own behalf'
);
select throws_ok(
  $$select * from public.jobs_search_attempts$$,
  '42501','permission denied for table jobs_search_attempts',
  'browser cannot read attempt counters'
);
reset role;

select * from finish();
rollback;
