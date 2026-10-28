begin;
select plan(16);
insert into auth.users(id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.billing_entitlements(owner_id,paid_through) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',now()+interval '30 days');
create temporary table capture_fixture(job jsonb);
insert into capture_fixture values (jsonb_build_object(
 'id','extension:one','provider','extension','providerJobId','one','dedupeKey',repeat('a',64),
 'title','Care coordinator','company','Example','descriptionText',repeat('界',12000),
 'capture',jsonb_build_object('description',repeat('界',12000),'original',jsonb_build_object('description',repeat('字',12000))),
 'sourceUrl','https://jobs.example/one','source','extension:jsonld','expiry',jsonb_build_object('source','unknown','expiresAt',null)));
grant select on capture_fixture to service_role;
set local role service_role;
select lives_ok($$select public.jobs_save('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',job) from capture_fixture$$,'multilingual reviewed and original captures fit the bounded snapshot');
select is((select count(*)::int from public.saved_jobs where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),1,'capture saved exactly once');
select is((select snapshot#>>'{capture,original,description}' from public.saved_jobs where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),repeat('字',12000),'original text retained');
select is((public.jobs_account_snapshot('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')->'savedJobs')::text,'[]','other account does not receive capture');
select is((public.jobs_save('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',(select job from capture_fixture)||jsonb_build_object('id','techmap:two','provider','techmap','providerJobId','two','dedupeKey',repeat('b',64),'sourceUrl','https://jobs.example/one/?utm_source=test'))->>'alreadySaved')::boolean,true,'provider tracking URL deduplicates with captured clean URL');
select isnt(public.jobs_source_identity('https://jobs.example/view?id=one'),public.jobs_source_identity('https://jobs.example/view?id=two'),'meaningful query identities remain distinct');
select isnt(public.jobs_source_identity('https://jobs.example/#one'),public.jobs_source_identity('https://jobs.example/#two'),'fragment-based job identities remain distinct');
select isnt(public.jobs_source_identity('https://jobs.example/view?id=one/'),public.jobs_source_identity('https://jobs.example/view?id=one'),'query values are never path-normalized');
select lives_ok($$select public.job_resume_version_create('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',(select id from public.saved_jobs where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'{}',repeat('a',64))$$,'capture can create normal Pro persistent version');
select is((select job_snapshot#>>'{capture,original,description}' from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),repeat('字',12000),'version snapshot preserves provenance');
select is(jsonb_array_length(public.job_resume_versions_list('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),0,'other account cannot list captured version');
select throws_ok($$select public.job_resume_version_get('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))$$,'P0001','Job resume not found','version remains owner bound');
select lives_ok($$select public.jobs_set_preferences('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"title":"Care coordinator"}',false)$$,'capture uses existing preferences');
select is(public.jobs_match_context('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')#>>'{criteria,title}','Care coordinator','match context carries account criteria');
select is(public.jobs_match_context('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')->'criteria','null'::jsonb,'criteria do not cross accounts');
reset role;
set local role authenticated;
select throws_ok($$select public.jobs_match_context('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,'42501',null,'replaced context RPC stays service-only');
reset role;
select * from finish();
rollback;
