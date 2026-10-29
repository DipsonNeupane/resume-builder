begin;
reset role;
select plan(34);
-- Fictional accounts. The trial owner is Free; the budget owner exercises the AI ledger.
insert into auth.users(id) values ('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7'),('b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8');
insert into public.saved_jobs(id,owner_id,provider,provider_job_id,dedupe_key,snapshot,source_url) values
 ('a1111111-1111-4111-8111-111111111111','a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','fixture','p1',repeat('7',64),'{"descriptionText":"Required: live chat."}','https://jobs.example/p1');

set local role service_role;
select lives_ok($$select public.job_resume_version_create('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111','{"summary":"Answered questions."}',repeat('a',64))$$,'a Free trial version is created');
create temporary table v as select id from public.job_resume_versions where owner_id='a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7';
grant select on v to service_role;

-- 1. Provenance is stored with the version, kept on later saves and cleared by a reset.
select is((public.job_resume_version_get('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from v)))->'provenance','[]'::jsonb,'a new version has no provenance');
select is((public.job_resume_version_update('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from v),1,'{"summary":"Answered customer questions."}','[{"id":"p1","origin":"ai"}]'))->'provenance','[{"id":"p1","origin":"ai"}]'::jsonb,'provenance is saved with the edit that accepted it');
select is((public.job_resume_version_update('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from v),2,'{"summary":"Answered customer questions by chat."}'))->'provenance','[{"id":"p1","origin":"ai"}]'::jsonb,'a save without provenance keeps the stored provenance');
select is((public.job_resume_version_get('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from v)))->'provenance','[{"id":"p1","origin":"ai"}]'::jsonb,'a reload returns the stored provenance');
select throws_ok($$select public.job_resume_version_update('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from v),3,'{"summary":"x"}','{"not":"an array"}')$$,'P0001','Invalid job resume update','provenance must be an array');
select throws_ok($$select public.job_resume_version_update('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from v),3,'{"summary":"x"}',(select jsonb_agg(jsonb_build_object('i',n)) from generate_series(1,61) n))$$,'23514',null,'provenance is bounded');
select throws_ok($$select public.job_resume_version_update('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from v),2,'{"summary":"stale"}','[]')$$,'P0001','Job resume conflict','a stale revision cannot overwrite provenance');
select throws_ok($$select public.job_resume_version_update('b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8',(select id from v),3,'{"summary":"x"}','[]')$$,'P0001','Job resume not found','another account cannot write provenance');

-- Kept documents copy provenance only when the snapshot is exactly the stored version.
select is((public.applications_attach_document('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111',(select id from v),'pdf','modern','{"summary":"Answered customer questions by chat."}',repeat('b',64)))->>'created','true','the exact version is kept');
select is((select provenance from public.job_application_documents where content_fingerprint=repeat('b',64)),'[{"id":"p1","origin":"ai"}]'::jsonb,'the kept document carries the version provenance');
select is(public.applications_document_get('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from public.job_application_documents where content_fingerprint=repeat('b',64)))->'provenance','[{"id":"p1","origin":"ai"}]'::jsonb,'retrieval returns the kept provenance');
select lives_ok($$select public.applications_attach_document('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111',(select id from v),'docx','modern','{"summary":"Different wording."}',repeat('c',64))$$,'a mismatched snapshot is still kept');
select is((select provenance from public.job_application_documents where content_fingerprint=repeat('c',64)),null,'but without provenance that would describe other wording');
select lives_ok($$select public.job_resume_version_update('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from v),3,'{"summary":"Later edit."}','[{"id":"p2","origin":"user"}]')$$,'later edits change the version');
select is((select provenance from public.job_application_documents where content_fingerprint=repeat('b',64)),'[{"id":"p1","origin":"ai"}]'::jsonb,'later edits never change the kept provenance');
reset role;
select throws_ok($$update public.job_application_documents set provenance='[]' where content_fingerprint=repeat('b',64)$$,'P0001','Application documents are immutable','kept provenance is immutable');
set local role service_role;
select is((public.job_resume_version_reset('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',(select id from v),4,'{"summary":"Answered questions."}',repeat('a',64)))->'provenance','[]'::jsonb,'a reset from the master clears provenance');
reset role;
set local role authenticated;
select throws_ok($$select provenance from public.job_resume_versions$$,'42501',null,'the browser cannot read provenance directly');
reset role;

-- 2. Trial runs: reserved before the provider call, released on failure.
set local role service_role;
select is(public.product_reserve_trial_run('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111','eeeeeeee-1111-4000-8000-000000000001'),'reserved','a first run is reserved');
select is(public.product_reserve_trial_run('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111','eeeeeeee-1111-4000-8000-000000000002'),'reserved','a second simultaneous run is reserved');
select is(public.product_reserve_trial_run('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111','eeeeeeee-1111-4000-8000-000000000003'),'reserved','a third simultaneous run is reserved');
select is(public.product_reserve_trial_run('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111','eeeeeeee-1111-4000-8000-000000000004'),'exhausted','a fourth simultaneous run is refused while three are pending');
select is(public.product_release_trial_run('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','eeeeeeee-1111-4000-8000-000000000002'),true,'a failed run releases its reservation');
select is((public.product_trial_status('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111')->>'runsRemaining')::int,1,'the failed run is not counted');
select is(public.product_record_trial_run('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111','eeeeeeee-1111-4000-8000-000000000001'),true,'a successful run turns its reservation into a used run');
select is(public.product_release_trial_run('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','eeeeeeee-1111-4000-8000-000000000001'),false,'a used run cannot be released');
select is(public.product_reserve_trial_run('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111','eeeeeeee-1111-4000-8000-000000000001'),'duplicate','a retried successful request does not reserve again');
reset role;
update public.product_tailoring_trial_runs set recorded_at = now() - interval '6 minutes' where request_id='eeeeeeee-1111-4000-8000-000000000003';
set local role service_role;
select is((public.product_trial_status('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7','a1111111-1111-4111-8111-111111111111')->>'runsRemaining')::int,2,'an abandoned reservation stops counting after five minutes');

-- 3. Configurable monthly AI budget and failure-neutral hourly allowance.
reset role;
update public.product_settings set ai_monthly_budget_micro_usd = 2000000 where id;
select throws_ok($$update public.product_settings set ai_monthly_budget_micro_usd = 25000001 where id$$,'23514',null,'the setting can never exceed US$25');
set local role service_role;
select ok(public.reserve_ai_budget('bbbbbbbb-1111-4000-8000-000000000001','b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8',1000000) and public.reserve_ai_budget('bbbbbbbb-1111-4000-8000-000000000002','b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8',1000000),'two reservations fit a lowered US$2 budget');
select throws_ok($$select public.reserve_ai_budget('bbbbbbbb-1111-4000-8000-000000000003','b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8',1)$$,'54000','AI monthly budget reached','the lowered budget is enforced');
reset role;
update public.product_settings set ai_monthly_budget_micro_usd = 25000000 where id;
-- Nineteen failed requests in the last hour do not use the hourly allowance of 20.
update public.ai_budget_requests set status='failed' where owner_id='b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8';
insert into public.ai_budget_requests(request_id,owner_id,month_start,reserved_micro_usd,status)
  select gen_random_uuid(),'b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8',date_trunc('month',timezone('UTC',now()))::date,1,'failed' from generate_series(1,17);
set local role service_role;
select ok(public.reserve_ai_budget('bbbbbbbb-1111-4000-8000-000000000004','b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8',1),'failed requests do not use the hourly allowance; recovery after raising the budget');
reset role;
insert into public.ai_budget_requests(request_id,owner_id,month_start,reserved_micro_usd,status)
  select gen_random_uuid(),'b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8',date_trunc('month',timezone('UTC',now()))::date,1,'failed' from generate_series(1,40);
set local role service_role;
select throws_ok($$select public.reserve_ai_budget('bbbbbbbb-1111-4000-8000-000000000005','b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8',1)$$,'54000','AI attempt limit reached','repeated failures are still bounded by the attempt cap');
select * from finish();
rollback;
