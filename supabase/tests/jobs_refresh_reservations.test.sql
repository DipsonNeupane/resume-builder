begin;
select plan(23);

insert into auth.users(id) values
  ('12121212-1212-1212-1212-121212121212'),
  ('34343434-3434-3434-3434-343434343434'),
  ('56565656-5656-5656-5656-565656565656');
insert into public.billing_entitlements(owner_id,paid_through)
  values('56565656-5656-5656-5656-565656565656',now()+interval '1 day');

set local role service_role;
select is((public.jobs_reserve_recommendation_refresh('12121212-1212-1212-1212-121212121212')->>'allowed')::boolean,true,
  'first Free refresh reserves the allowance');
select is((select last_provider_refresh_at is not null from public.job_preferences where owner_id='12121212-1212-1212-1212-121212121212'),true,
  'Free reservation is persisted in the existing refresh timestamp');
select is((public.jobs_reserve_recommendation_refresh('12121212-1212-1212-1212-121212121212')->>'allowed')::boolean,false,
  'a concurrent or stale second Free request cannot pass the reservation');
select is(
  (public.jobs_reserve_recommendation_refresh('12121212-1212-1212-1212-121212121212')->>'nextRefreshAt')::timestamptz,
  (select last_provider_refresh_at+interval '24 hours' from public.job_preferences where owner_id='12121212-1212-1212-1212-121212121212'),
  'blocked Free response gives the authoritative next refresh time');

select is(public.jobs_release_recommendation_refresh('34343434-3434-3434-3434-343434343434',
  (select last_provider_refresh_at from public.job_preferences where owner_id='12121212-1212-1212-1212-121212121212'),null),false,
  'another account cannot release the owner reservation');
select is(public.jobs_release_recommendation_refresh('12121212-1212-1212-1212-121212121212',
  (select last_provider_refresh_at+interval '1 second' from public.job_preferences where owner_id='12121212-1212-1212-1212-121212121212'),null),false,
  'a stale or forged reservation timestamp cannot release the allowance');
select is(public.jobs_release_recommendation_refresh('12121212-1212-1212-1212-121212121212',
  (select last_provider_refresh_at from public.job_preferences where owner_id='12121212-1212-1212-1212-121212121212'),null),true,
  'the exact failed reservation is released');
select is((select last_provider_refresh_at is null from public.job_preferences where owner_id='12121212-1212-1212-1212-121212121212'),true,
  'failed first refresh restores the prior null timestamp');
select is((public.jobs_reserve_recommendation_refresh('12121212-1212-1212-1212-121212121212')->>'allowed')::boolean,true,
  'a safely released failure does not consume the Free allowance');

reset role;
update public.job_preferences set last_provider_refresh_at=now()-interval '25 hours'
  where owner_id='12121212-1212-1212-1212-121212121212';
set local role service_role;
select is((public.jobs_reserve_recommendation_refresh('12121212-1212-1212-1212-121212121212')->>'allowed')::boolean,true,
  'Free refresh is available again after the daily cadence');
select ok((public.jobs_reserve_recommendation_refresh('12121212-1212-1212-1212-121212121212')->>'previousRefreshAt') is not null,
  'a blocked retry preserves the successful prior refresh timestamp');

select is((public.jobs_reserve_recommendation_refresh('56565656-5656-5656-5656-565656565656')->>'isPro')::boolean,true,
  'active Pro is recognized authoritatively');
select is((public.jobs_reserve_recommendation_refresh('56565656-5656-5656-5656-565656565656')->>'allowed')::boolean,true,
  'Pro can refresh repeatedly without the Free daily product limit');
select is((select count(*)::int from public.job_preferences where owner_id='56565656-5656-5656-5656-565656565656'),0,
  'Pro refresh authorization does not create a Free cadence reservation');

select throws_ok($$select public.jobs_reserve_recommendation_refresh(null)$$,'22023','Invalid job refresh',
  'null owner cannot reserve');
select throws_ok($$select public.jobs_release_recommendation_refresh(null,now(),null)$$,'22023','Invalid job refresh release',
  'null owner cannot release');
select throws_ok($$select public.jobs_release_recommendation_refresh('12121212-1212-1212-1212-121212121212',null,null)$$,
  '22023','Invalid job refresh release','null reservation cannot release');

set local role authenticated;
select throws_ok($$select public.jobs_reserve_recommendation_refresh('12121212-1212-1212-1212-121212121212')$$,
  '42501','permission denied for function jobs_reserve_recommendation_refresh','authenticated browser cannot reserve directly');
select throws_ok($$select public.jobs_release_recommendation_refresh('12121212-1212-1212-1212-121212121212',now(),null)$$,
  '42501','permission denied for function jobs_release_recommendation_refresh','authenticated browser cannot release directly');
set local role anon;
select throws_ok($$select public.jobs_reserve_recommendation_refresh('12121212-1212-1212-1212-121212121212')$$,
  '42501','permission denied for function jobs_reserve_recommendation_refresh','anonymous caller cannot reserve directly');
select throws_ok($$select public.jobs_release_recommendation_refresh('12121212-1212-1212-1212-121212121212',now(),null)$$,
  '42501','permission denied for function jobs_release_recommendation_refresh','anonymous caller cannot release directly');

reset role;
select has_function('public','jobs_reserve_recommendation_refresh',array['uuid'],
  'reservation RPC exists with the bounded owner-only signature');
select has_function('public','jobs_release_recommendation_refresh',array['uuid','timestamp with time zone','timestamp with time zone'],
  'release RPC exists with compare-and-restore inputs');

select * from finish();
rollback;
