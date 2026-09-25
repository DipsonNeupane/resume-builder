begin;
select plan(36);

insert into auth.users(id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.billing_entitlements(owner_id,paid_through) values
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() + interval '30 days');

create temporary table job_fixture(job jsonb);
insert into job_fixture values ('{
  "id":"techmap:one","provider":"techmap","providerJobId":"one",
  "dedupeKey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "title":"Engineer","company":"Example","location":{"value":{"city":"Nairobi","region":null,"country":"KE"},"source":"provider","confidence":"medium"},
  "workplace":{"value":"remote","source":"provider","confidence":"high"},
  "employmentType":{"value":"full_time","source":"provider","confidence":"high"},
  "salary":null,"descriptionExcerpt":"Build services.","postedAt":null,
  "expiry":{"expiresAt":null,"isLikelyExpired":false,"source":"unknown","confidence":"low"},
  "sourceUrl":"https://jobs.example/one","portal":"example","source":"employer",
  "retrievedAt":"2026-09-24T00:00:00.000Z","matchLabel":"good","matchReasons":["Relevant title."]
}'::jsonb);
grant select on job_fixture to service_role;

set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok($$select * from public.saved_jobs$$, '42501', null, 'authenticated browsers cannot read server-only saved jobs');
select throws_ok($$select * from public.job_preferences$$, '42501', null, 'authenticated browsers cannot read server-only preferences');
select throws_ok($$select public.jobs_account_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$, '42501', null, 'authenticated browsers cannot invoke the account snapshot RPC');
reset role;

set local role service_role;
select is((public.jobs_account_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')->>'saveLimit')::int, 3, 'Free account reports the three-job limit');
select is(public.jobs_account_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')#>>'{preferences,autoRefresh}', 'false', 'Auto Refresh defaults off');

select lives_ok($$select public.jobs_save('cccccccc-cccc-cccc-cccc-cccccccccccc', job || jsonb_build_object(
  'id','techmap:inferred-stale','providerJobId','inferred-stale',
  'dedupeKey','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'sourceUrl','https://jobs.example/inferred-stale',
  'expiry',jsonb_build_object('expiresAt',null,'isLikelyExpired',true,'source','inferred','confidence','medium')))
  from job_fixture$$, 'an inferred-stale job can be saved');
select is((select provider_available from public.saved_jobs where owner_id='cccccccc-cccc-cccc-cccc-cccccccccccc'), true,
  'jobs_save keeps inferred posting-age staleness available');
select is((select expires_at is null from public.saved_jobs where owner_id='cccccccc-cccc-cccc-cccc-cccccccccccc'), true,
  'inferred expiry metadata is not promoted into the definitive provider expiry column');
select is((public.jobs_account_snapshot('cccccccc-cccc-cccc-cccc-cccccccccccc')#>>'{savedJobs,0,snapshot,expiry,source}'), 'inferred',
  'the immutable snapshot retains inferred expiry provenance');
select is(public.jobs_mark_seen('cccccccc-cccc-cccc-cccc-cccccccccccc',array['techmap:inferred-stale'],
  array[(now()-interval '1 day')::timestamptz],array['inferred']), 1,
  'jobs_mark_seen accepts an inferred-stale positive observation without declaring provider expiry');
select is((public.jobs_account_snapshot('cccccccc-cccc-cccc-cccc-cccccccccccc')#>>'{savedJobs,0,providerAvailable}')::boolean, true,
  'an inferred-stale observed job remains available');
select is(public.jobs_mark_seen('cccccccc-cccc-cccc-cccc-cccccccccccc',array['techmap:inferred-stale'],
  array[(now()-interval '1 day')::timestamptz],array['provider']), 1,
  'an explicit provider expiry observation updates availability');
select is((public.jobs_account_snapshot('cccccccc-cccc-cccc-cccc-cccccccccccc')#>>'{savedJobs,0,providerAvailable}')::boolean, false,
  'an explicit provider expiry marks the saved job unavailable');
select is((public.jobs_account_snapshot('cccccccc-cccc-cccc-cccc-cccccccccccc')#>>'{savedJobs,0,snapshot,expiry,source}'), 'inferred',
  'availability refreshes never rewrite the immutable inferred-expiry snapshot');

select is((public.jobs_save('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', job)->>'alreadySaved')::boolean, false, 'first save inserts') from job_fixture;
select is((public.jobs_save('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', job)->>'alreadySaved')::boolean, true, 'duplicate save is idempotent') from job_fixture;
select is((select count(*)::int from public.saved_jobs where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1, 'duplicate does not consume another slot');

select lives_ok($$select public.jobs_save('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', job || '{"id":"techmap:two","providerJobId":"two","dedupeKey":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","sourceUrl":"https://jobs.example/two"}'::jsonb) from job_fixture$$, 'second Free save succeeds');
select lives_ok($$select public.jobs_save('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', job || '{"id":"techmap:three","providerJobId":"three","dedupeKey":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","sourceUrl":"https://jobs.example/three"}'::jsonb) from job_fixture$$, 'third Free save succeeds');
select throws_ok($$select public.jobs_save('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', job || '{"id":"techmap:four","providerJobId":"four","dedupeKey":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","sourceUrl":"https://jobs.example/four"}'::jsonb) from job_fixture$$, 'P0001', 'Free saved-job limit reached', 'fourth new Free save is transactionally blocked');
select is((select count(*)::int from public.saved_jobs where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 3, 'blocked save preserves all existing records');

select lives_ok($$select public.jobs_set_preferences('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"title":"Nurse","countryCode":"GB"}'::jsonb,true)$$, 'account can explicitly opt in to Auto Refresh');
select is(public.jobs_account_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')#>>'{preferences,autoRefresh}', 'true', 'opt-in is persisted');
select is(public.jobs_account_snapshot('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')#>>'{preferences,autoRefresh}', 'false', 'second account does not inherit preferences');
select is((public.jobs_account_snapshot('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')->>'saveLimit')::int, 10000, 'Pro exposes the documented high safety ceiling');
select lives_ok($$select public.jobs_save('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', job || jsonb_build_object(
  'id','techmap:pro-'||n,'providerJobId','pro-'||n,'dedupeKey',repeat((n+3)::text,64),'sourceUrl','https://jobs.example/pro-'||n))
  from job_fixture cross join generate_series(1,4) n$$, 'Pro can save beyond the Free ceiling');
select is((select count(*)::int from public.saved_jobs where owner_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 4, 'Pro save count exceeds three without changing entitlement behavior');
reset role;
update public.billing_entitlements set paid_through=now()-interval '1 second' where owner_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
set local role service_role;
select is(public.jobs_account_snapshot('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')->>'isPro', 'false', 'expired entitlement is recognized without mutating saved records');
select is((select count(*)::int from public.saved_jobs where owner_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 4, 'saved records remain after Pro expires even above the Free ceiling');
select throws_ok($$select public.jobs_save('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', job || '{"id":"techmap:after-expiry","providerJobId":"after-expiry","dedupeKey":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","sourceUrl":"https://jobs.example/after-expiry"}'::jsonb) from job_fixture$$,
  'P0001', 'Free saved-job limit reached', 'expired Pro blocks only a new save');
select lives_ok($$select public.jobs_set_preferences('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"title":"Nurse"}'::jsonb,false)$$, 'Auto Refresh can be turned back off');

reset role;
update public.saved_jobs set expires_at=now()-interval '1 day' where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and provider_job_id='two';
set local role service_role;
select is((public.jobs_account_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')#>'{savedJobs}') @>
  '[{"providerAvailable":false}]'::jsonb, true, 'explicit expiry marks a saved record unavailable without deleting it');
select is(public.jobs_mark_seen('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',array['techmap:two'],array[(now()+interval '10 days')::timestamptz],array['provider']), 1,
  'a fresh positive provider observation restores availability and refreshes expiry separately');

select is(public.jobs_remove('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',(select id from public.saved_jobs where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1)), false, 'another account cannot remove a saved job');
select is(public.jobs_remove('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',(select id from public.saved_jobs where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1)), true, 'owner can explicitly remove a saved job');
select is((select count(*)::int from public.saved_jobs where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 2, 'explicit removal affects only the selected record');

reset role;
select * from finish();
rollback;
