begin;
reset role;
select plan(16);
insert into auth.users(id) values ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4');
insert into public.saved_jobs(id,owner_id,provider,provider_job_id,dedupe_key,snapshot,source_url) values
 ('c1111111-1111-4111-8111-111111111111','c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','fixture','t1',repeat('1',64),'{"descriptionText":"Required: Zendesk."}','https://jobs.example/t1'),
 ('c2222222-2222-4222-8222-222222222222','c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','fixture','t2',repeat('2',64),'{}','https://jobs.example/t2'),
 ('d1111111-1111-4111-8111-111111111111','d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','fixture','t3',repeat('3',64),'{}','https://jobs.example/t3');

set local role authenticated;
select throws_ok($$select * from public.product_tailoring_trials$$,'42501',null,'browser cannot read trial state');
select throws_ok($$select public.product_record_trial_run('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c1111111-1111-4111-8111-111111111111',gen_random_uuid())$$,'42501',null,'browser cannot record a trial run');
reset role;

set local role service_role;
select is((public.jobs_account_snapshot('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3')->'tailoringTrial'->>'available')::boolean,true,'a new Free account sees one available trial before acting');
-- A failed creation (invalid payload) consumes nothing.
select throws_ok($$select public.job_resume_version_create('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c1111111-1111-4111-8111-111111111111','{}','not-a-fingerprint')$$,'P0001','Invalid job resume','invalid creation fails');
select is((select count(*) from public.product_tailoring_trials),0::bigint,'failed creation does not consume the trial');
select lives_ok($$select public.job_resume_version_create('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c1111111-1111-4111-8111-111111111111','{"name":"Master"}',repeat('a',64))$$,'the trial prepares one application without Pro');
select is((select item->>'stage' from jsonb_array_elements(public.applications_list('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3')) item where item->>'savedJobId'='c1111111-1111-4111-8111-111111111111'),'preparing','preparing is recorded as a user event');
select throws_ok($$select public.job_resume_version_create('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c2222222-2222-4222-8222-222222222222','{"name":"Master"}',repeat('a',64))$$,'P0001','Active Pro required','a second application requires Pro');
select is((public.job_tailoring_inputs('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c1111111-1111-4111-8111-111111111111',(select id from public.job_resume_versions where owner_id='c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'))->>'trial')::boolean,true,'tailoring inputs mark the trial application');
select is(public.product_record_trial_run('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c1111111-1111-4111-8111-111111111111','eeeeeeee-0000-4000-8000-000000000001'),true,'a successful run is counted');
select is(public.product_record_trial_run('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c1111111-1111-4111-8111-111111111111','eeeeeeee-0000-4000-8000-000000000001'),false,'a retried request is not counted twice');
select is(public.product_record_trial_run('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c2222222-2222-4222-8222-222222222222','eeeeeeee-0000-4000-8000-000000000002'),false,'runs never count for another application');
select public.product_record_trial_run('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c1111111-1111-4111-8111-111111111111',('eeeeeeee-0000-4000-8000-00000000000'||n)::uuid) from generate_series(3,4) n;
select is((public.job_tailoring_inputs('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','c1111111-1111-4111-8111-111111111111',(select id from public.job_resume_versions where owner_id='c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'))->>'trial')::boolean,false,'the trial ends after the configured number of successful runs');
select is((public.jobs_account_snapshot('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4')->'tailoringTrial'->>'used')::boolean,false,'trial use is per account');
reset role;
update public.saved_jobs set match_analysis='{"version":2,"label":"good"}'::jsonb where owner_id='c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
set local role service_role;
select isnt((select e->'matchAnalysis' from jsonb_array_elements(public.jobs_account_snapshot_v2('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',null)->'savedJobs') e where e->>'id'='c1111111-1111-4111-8111-111111111111'),'null'::jsonb,'the trial-bound application returns its stored analysis for the server to shape');
select is((select e->'matchAnalysis' from jsonb_array_elements(public.jobs_account_snapshot_v2('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',null)->'savedJobs') e where e->>'id'='c2222222-2222-4222-8222-222222222222'),'null'::jsonb,'other Free applications still receive no persisted full analysis');
select * from finish();
rollback;
