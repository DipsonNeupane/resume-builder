begin;
reset role;
select plan(40);
insert into auth.users(id) values ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2');

create temp table manual_fixture as select jsonb_build_object(
  'id','manual:'||n,'provider','manual','providerJobId',n::text,'dedupeKey',encode(sha256(convert_to('manual:'||n,'UTF8')),'hex'),
  'title','Support specialist '||n,'company','Example Company','sourceUrl',null) as job, n
from generate_series(1,102) n;
grant select on manual_fixture to service_role;

set local role authenticated;
select throws_ok($$select * from public.job_application_workflows$$,'42501',null,'browser cannot read application rows');
select throws_ok($$select * from public.job_application_events$$,'42501',null,'browser cannot read application events');
select throws_ok($$select * from public.job_application_documents$$,'42501',null,'browser cannot read application documents');
select throws_ok($$select * from public.product_settings$$,'42501',null,'browser cannot read or change plan settings');
select throws_ok($$select public.applications_list('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1')$$,'42501',null,'browser cannot list applications');
select throws_ok($$select public.applications_apply('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','11111111-1111-4111-8111-111111111111',0,'{}','user')$$,'42501',null,'internal transition helper is not callable');
reset role;

set local role service_role;
select is((select free_application_limit from public.product_settings),100,'launch Free cap defaults to 100 applications');
select is((select free_tailoring_trials from public.product_settings),1,'launch Free tailoring trial defaults to one');
select is(public.applications_owner_limit('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),100,'Free owner limit comes from product settings');

-- Quick add with stage first and nothing else required.
select is((public.applications_create('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select job from manual_fixture where n=1),'{"stage":"saved"}','user')->>'alreadySaved')::boolean,false,'manual application without a URL is created');
select is(public.applications_list('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1')->0->>'stage','saved','new application is saved');
select is(public.applications_list('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1')->0->'events'->0->>'kind','created','creation is an explicit event');
select is((select count(*) from public.saved_jobs where owner_id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1' and source_url is null),1::bigint,'manual record keeps a null source URL');
select throws_ok($$select public.jobs_save('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select job from manual_fixture where n=2))$$,'P0001','Invalid saved job','manual records cannot bypass the application path');

-- Same company/title is never a hard duplicate; the same job URL identity is.
select is((public.applications_create('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select job from manual_fixture where n=2)||'{"title":"Support specialist 1","sourceUrl":"https://jobs.example/view?gh_jid=55&utm_source=news"}','{"stage":"saved"}','user')->>'alreadySaved')::boolean,false,'same company and title with a different opening is allowed');
select is((public.applications_create('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select job from manual_fixture where n=3)||'{"sourceUrl":"https://JOBS.example/view?gh_jid=55"}','{"stage":"saved"}','user')->>'alreadySaved')::boolean,true,'tracking parameters and host case do not create a duplicate');
select isnt(public.jobs_source_identity('https://jobs.example/view?gh_jid=55'),public.jobs_source_identity('https://jobs.example/view?gh_jid=56'),'meaningful identifiers are kept');

-- Stage transitions, closed reason, prior stage, reopen.
create temp table target as select id from public.saved_jobs where owner_id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1' and source_url is null;
select is(public.applications_update('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),1,'{"stage":"applied","appliedOn":"2026-10-20"}')->>'appliedOn','2026-10-20','applied records the submission date');
select throws_ok($$select public.applications_update('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),1,'{"stage":"interviewing"}')$$,'P0001','Application conflict','stale revision cannot overwrite');
select throws_ok($$select public.applications_update('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),2,'{"stage":"closed"}')$$,'P0001','Closed reason required','closing requires a separate reason');
select is(public.applications_update('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),2,'{"stage":"closed","closedReason":"no_response"}')->>'closedReason','no_response','no response is its own reason, not a rejection');
select is((select e->>'priorStage' from jsonb_array_elements(public.applications_list('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1')) e where (e->>'savedJobId')::uuid=(select id from target)),'applied','prior stage is recorded');
select is((select public.applications_update('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),3,'{"stage":"interviewing","nextAction":"Prepare interview","nextActionDue":"2026-11-02T15:00:00Z"}')->>'closedReason'),null::text,'reopening clears the closed reason');
select is((select count(*) from public.job_application_events e join target t on t.id=e.saved_job_id where e.kind='stage_changed'),3::bigint,'each stage change is an event');
select is((select count(*) from public.job_application_events e join target t on t.id=e.saved_job_id where e.kind='next_action'),1::bigint,'next action change is recorded without its text');

-- Owner isolation for rows, documents and imports.
select throws_ok($$select public.applications_update('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',(select id from target),4,'{"stage":"offer"}')$$,'P0001','Saved job not found','another owner cannot update the application');
select is(jsonb_array_length(public.applications_list('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2')),0,'another owner lists nothing');
select throws_ok($$select public.applications_attach_document('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',(select id from target),null,'pdf','modern','{"name":"Other"}',repeat('c',64))$$,'P0001','Saved job not found','another owner cannot attach a document');

-- Immutable exported documents and explicit submission.
select is((public.applications_attach_document('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),null,'pdf','modern','{"name":"Exported"}',repeat('d',64))->>'created')::boolean,true,'exported document snapshot is attached');
select is((public.applications_attach_document('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),null,'pdf','modern','{"name":"Exported"}',repeat('d',64))->>'created')::boolean,false,'identical export retry is recorded once');
reset role;
select throws_ok($$update public.job_application_documents set resume_snapshot='{"name":"Changed"}'$$,'P0001','Application documents are immutable','stored document content cannot change');
set local role service_role;
select is(public.applications_document_get('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',(select id from public.job_application_documents limit 1)),null::jsonb,'another owner cannot retrieve the document');
select is(public.applications_confirm_submitted('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),4,(select id from public.job_application_documents limit 1),'2026-10-21')->>'stage','applied','explicit confirmation records applied');
select is(public.applications_document_get('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from public.job_application_documents limit 1))#>>'{resume,name}','Exported','exact submitted snapshot is retrievable');

-- Free cap: 100 records, clear refusal, nothing deleted.
select lives_ok($$select public.applications_create('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',job,'{"stage":"saved"}','import') from manual_fixture where n between 4 and 101 order by n$$,'Free owner organizes 100 records');
select is((select count(*) from public.saved_jobs where owner_id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),100::bigint,'one hundred applications are stored');
select throws_ok($$select public.applications_create('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select job from manual_fixture where n=102),'{"stage":"saved"}','user')$$,'P0001','Free application limit reached','the 101st Free application is refused without deleting anything');
select is(public.applications_update('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),(select revision from public.job_application_workflows where saved_job_id=(select id from target)),'{"stage":"interviewing"}')->>'stage','interviewing','at the cap an existing application can still change stage');
reset role;
update public.product_settings set free_application_limit = 10;
set local role service_role;
select is(public.applications_update('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',(select id from target),(select revision from public.job_application_workflows where saved_job_id=(select id from target)),'{"nextAction":"Send thank-you note"}')->>'nextAction','Send thank-you note','over the limit (for example after Pro ends) every record stays editable');
reset role;
delete from public.saved_jobs where id=(select id from target);
select is((select count(*) from public.job_application_documents where saved_job_id=(select id from target)),0::bigint,'removing the application removes its documents and events');
select * from finish();
rollback;
