-- Expand/contract rollback window: the previous release (jobs_workflow_* RPCs and the
-- legacy columns) and this release (stage/closed_reason) stay consistent. Not run after
-- the contract step, which removes the legacy shape.
begin;
reset role;
select plan(10);
insert into auth.users(id) values ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3');
set local role service_role;
create temp table legacy_target as select (public.applications_create('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  jsonb_build_object('id','manual:legacy','provider','manual','providerJobId','legacy','dedupeKey',encode(sha256(convert_to('manual:legacy','UTF8')),'hex'),
    'title','Support specialist','company','Example Company','sourceUrl',null),'{"stage":"saved"}','user')->>'savedJobId')::uuid as id;

select is((select application_status||'/'||decision from public.job_application_workflows where saved_job_id=(select id from legacy_target)),'not_applied/review','a new saved application has the matching legacy pair');

-- This release writes the stage; the legacy pair follows.
select is(public.applications_update('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',(select id from legacy_target),1,'{"stage":"applied","appliedOn":"2026-10-20"}')->>'stage','applied','new release moves to applied');
select is((select application_status||'/'||decision from public.job_application_workflows where saved_job_id=(select id from legacy_target)),'applied/pursue','legacy pair mirrors applied');
select is((public.jobs_workflow_list('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3')->0->>'applicationStatus'),'applied','previous release reads the stage written by this release');

-- The previous release writes the legacy pair; the stage follows.
select is((public.jobs_workflow_upsert('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',(select id from legacy_target),'pursue','interviewing','','','',false,null,
  (select revision from public.job_application_workflows where saved_job_id=(select id from legacy_target)))->>'applicationStatus'),'interviewing','previous release can still write');
select is(public.applications_list('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3')->0->>'stage','interviewing','this release reads the previous release''s change');
select is((select prior_stage from public.job_application_workflows where saved_job_id=(select id from legacy_target)),'applied','prior stage is kept for undo');
select ok(public.jobs_workflow_upsert('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',(select id from legacy_target),'pursue','withdrawn','','','',false,null,
  (select revision from public.job_application_workflows where saved_job_id=(select id from legacy_target))) is not null,'previous release withdraws');
select is((select stage||'/'||closed_reason from public.job_application_workflows where saved_job_id=(select id from legacy_target)),'closed/withdrawn','withdrawn maps to closed with a withdrawn reason, satisfying the closed-reason constraint');
select is(public.applications_update('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',(select id from legacy_target),
  (select revision from public.job_application_workflows where saved_job_id=(select id from legacy_target)),'{"stage":"closed","closedReason":"no_response"}')->>'closedReason','no_response','closed with no response stays distinct from rejected');
select * from finish();
rollback;
