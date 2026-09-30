begin;
reset role;
select plan(12);
insert into auth.users(id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.saved_jobs(id,owner_id,provider,provider_job_id,dedupe_key,snapshot,source_url) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','fixture','one',repeat('a',64),'{}','https://jobs.example/one');

set local role authenticated;
select throws_ok($$select * from public.job_application_workflows$$,'42501',null,'browser cannot read workflow rows');
select throws_ok($$select * from public.job_application_history$$,'42501',null,'browser cannot read workflow history');
select throws_ok($$select public.jobs_workflow_list('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,'42501',null,'browser cannot list workflow data');
select throws_ok($$select public.jobs_workflow_upsert('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','pursue','applied','','','',false,null,0)$$,'42501',null,'browser cannot write workflow data');
reset role;

set local role service_role;
select throws_ok($$select public.jobs_workflow_upsert('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','pursue','applied','','','',false,null,0)$$,'P0001','Saved job not found','another owner cannot bind the job');
select lives_ok($$select public.jobs_workflow_upsert('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','review','not_applied','private note','Person','contact',false,null,0)$$,'owner creates a manual workflow');
select is((public.jobs_workflow_list('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')->0->>'decision'),'review','owner receives the saved decision');
select is(jsonb_array_length(public.jobs_workflow_list('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),0,'other owner receives no workflow');
select throws_ok($$select public.jobs_workflow_upsert('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','pursue','applied','','','',false,null,0)$$,'P0001','Job workflow conflict','stale revision cannot overwrite workflow');
select lives_ok($$select public.jobs_workflow_upsert('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','pursue','applied','','','',true,now()+interval '1 day',1)$$,'explicit future follow-up is accepted');
select is((select count(*) from public.job_application_history where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),2::bigint,'decision and status changes produce bounded metadata history');
reset role;
delete from public.saved_jobs where id='11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.job_application_workflows where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),0::bigint,'removing the saved job removes workflow content');
select * from finish();
rollback;
