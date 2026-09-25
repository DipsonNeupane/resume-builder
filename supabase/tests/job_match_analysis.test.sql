begin;
select plan(33);

insert into auth.users(id) values
 ('dddddddd-dddd-dddd-dddd-dddddddddddd'),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
insert into public.billing_entitlements(owner_id,paid_through) values
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',now()+interval '30 days');

create temporary table match_fixture(job jsonb, analysis jsonb);
insert into match_fixture values (
 '{"id":"techmap:match-one","provider":"techmap","providerJobId":"match-one","dedupeKey":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","title":"Engineer","company":"Example","location":{"value":{"city":"Nairobi","region":null,"country":"KE"},"source":"provider","confidence":"medium"},"workplace":{"value":"remote","source":"provider","confidence":"high"},"employmentType":{"value":"full_time","source":"provider","confidence":"high"},"salary":null,"descriptionText":"Required: TypeScript.","postedAt":null,"expiry":{"expiresAt":null,"isLikelyExpired":false,"source":"unknown","confidence":"low"},"sourceUrl":"https://jobs.example/match-one","portal":"example","source":"employer","retrievedAt":"2026-09-24T00:00:00.000Z","matchLabel":"good","matchReasons":["Relevant title."]}'::jsonb,
 ('{"version":1,"label":"good","resumeHash":"'||repeat('a',64)||'","jobHash":"'||repeat('b',64)||'","contextHash":"'||repeat('c',64)||'","whyPromising":"Evidence aligns.","observations":[],"importantWarning":null,"seniorityMessage":null,"requirements":[],"strengths":[],"buriedEvidence":[],"areasWorthStrengthening":[],"constraints":[],"deeperExplanation":"Evidence only."}')::jsonb
);
grant select on match_fixture to service_role;

set local role authenticated;
set local request.jwt.claim.sub to 'dddddddd-dddd-dddd-dddd-dddddddddddd';
select throws_ok($$select * from public.job_match_clarifications$$,'42501',null,'browser cannot read match clarifications');
select throws_ok($$select public.jobs_match_context('dddddddd-dddd-dddd-dddd-dddddddddddd')$$,'42501',null,'browser cannot call match context RPC');
select throws_ok($$select public.jobs_save_v2('dddddddd-dddd-dddd-dddd-dddddddddddd','{}','{}')$$,'42501',null,'browser cannot persist match analysis directly');
select throws_ok($$select public.jobs_saved_match_inputs('dddddddd-dddd-dddd-dddd-dddddddddddd','00000000-0000-0000-0000-000000000000')$$,'42501',null,'browser cannot read saved re-analysis inputs');
select throws_ok($$select public.jobs_replace_match_analysis('dddddddd-dddd-dddd-dddd-dddddddddddd','00000000-0000-0000-0000-000000000000','{}')$$,'42501',null,'browser cannot replace saved analysis');
reset role;

set local role service_role;
select throws_ok($$select public.jobs_save_v2('dddddddd-dddd-dddd-dddd-dddddddddddd',job,analysis-'version') from match_fixture$$,'P0001','Invalid match analysis','missing analysis version is rejected rather than passing through SQL null semantics');
select lives_ok($$select public.jobs_save_v2('dddddddd-dddd-dddd-dddd-dddddddddddd',job,analysis) from match_fixture$$,'server can save a bounded versioned analysis');
select is((select match_analysis_version from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),1,'analysis version is persisted');
select is((public.jobs_account_snapshot_v2('dddddddd-dddd-dddd-dddd-dddddddddddd',repeat('a',64))#>>'{savedJobs,0,analysisCurrent}')::boolean,true,'matching resume hash keeps analysis current');
select is(public.jobs_account_snapshot_v2('dddddddd-dddd-dddd-dddd-dddddddddddd',repeat('a',64))#>>'{savedJobs,0,matchAnalysis}',null,'Free account does not receive the persisted full analysis payload');
select is((public.jobs_account_snapshot_v2('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',repeat('a',64))#>>'{savedJobs,0,id}')::text,null,'another account cannot receive the saved analysis');
select lives_ok($$select public.jobs_save_v2('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',job,analysis) from match_fixture$$,'Pro owner can persist its own analysis');
select isnt(public.jobs_account_snapshot_v2('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',repeat('a',64))#>>'{savedJobs,0,matchAnalysis}',null,'Pro account snapshot includes its persisted analysis for server shaping');
select is(public.jobs_saved_match_inputs('dddddddd-dddd-dddd-dddd-dddddddddddd',(select id from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'))#>>'{snapshot,providerJobId}','match-one','manual refresh reads the immutable owner snapshot');
select throws_ok($$select public.jobs_saved_match_inputs('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',(select id from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'))$$,'P0001','Saved job not found','another account cannot read manual refresh inputs');
select is(public.jobs_replace_match_analysis('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',(select id from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),(select analysis from match_fixture)),false,'another account cannot replace saved analysis');
reset role;
update public.saved_jobs set match_invalidated_at=now(),match_invalidation_reason='resume_changed' where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd';
set local role service_role;
select is(public.jobs_replace_match_analysis('dddddddd-dddd-dddd-dddd-dddddddddddd',(select id from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),(select analysis from match_fixture)),true,'owner can manually replace stale analysis');
select is((select match_invalidation_reason from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),null,'manual replacement clears explicit stale state');
select is((select match_resume_hash||match_job_hash||match_context_hash from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),repeat('a',64)||repeat('b',64)||repeat('c',64),'manual replacement persists all explicit invalidation hashes');
reset role;
update public.saved_jobs set match_analysis_version=0 where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd';
set local role service_role;
select is((public.jobs_account_snapshot_v2('dddddddd-dddd-dddd-dddd-dddddddddddd',repeat('a',64))#>>'{savedJobs,0,analysisCurrent}')::boolean,false,'an older analysis version is explicitly invalidated');
select is((select match_invalidation_reason from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),'analysis_version_changed','analysis version invalidation reason is persisted');
select lives_ok($$select public.jobs_save_v2('dddddddd-dddd-dddd-dddd-dddddddddddd',job,analysis) from match_fixture$$,'current-version analysis replaces the stale version');
select is((public.jobs_account_snapshot_v2('dddddddd-dddd-dddd-dddd-dddddddddddd',repeat('d',64))#>>'{savedJobs,0,analysisCurrent}')::boolean,false,'changed resume hash explicitly invalidates analysis');
select is((select match_invalidation_reason from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),'resume_changed','resume invalidation reason is persisted');

select lives_ok($$select public.jobs_save_v2('dddddddd-dddd-dddd-dddd-dddddddddddd',job,analysis) from match_fixture$$,'re-analysis refreshes the same saved record');
select lives_ok($$select public.jobs_set_match_clarification('dddddddd-dddd-dddd-dddd-dddddddddddd','0123456789abcdef','not_have')$$,'explicit qualification clarification is persisted');
select is(public.jobs_match_context('dddddddd-dddd-dddd-dddd-dddddddddddd')#>>'{clarifications,0123456789abcdef}','not_have','clarification is account scoped');
select is((select match_invalidation_reason from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),'clarifications_changed','clarification invalidates prior analysis');

select lives_ok($$select public.jobs_save_v2('dddddddd-dddd-dddd-dddd-dddddddddddd',job,analysis) from match_fixture$$,'analysis can be refreshed after clarification');
select is(public.jobs_invalidate_job_analyses('dddddddd-dddd-dddd-dddd-dddddddddddd',array['techmap:match-one'],array[repeat('e',64)]),1,'changed job description hash invalidates saved analysis');
select is((select match_invalidation_reason from public.saved_jobs where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),'job_changed','job invalidation reason is persisted');

reset role;
insert into public.job_match_clarifications(owner_id,requirement_id,value)
select 'dddddddd-dddd-dddd-dddd-dddddddddddd',lpad(to_hex(i),16,'0'),'unsure' from generate_series(2,100) i;
set local role service_role;
select is((select count(*) from public.job_match_clarifications where owner_id='dddddddd-dddd-dddd-dddd-dddddddddddd'),100::bigint,'clarification persistence is bounded per account');
select throws_ok($$select public.jobs_set_match_clarification('dddddddd-dddd-dddd-dddd-dddddddddddd','ffffffffffffffff','unsure')$$,'P0001','Match clarification limit reached','the clarification bound rejects a new row');

rollback;
