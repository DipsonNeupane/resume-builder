begin;
select plan(8);

insert into auth.users(id) values
 ('abababab-abab-4bab-8bab-abababababab'),
 ('bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc');
insert into public.saved_jobs(id,owner_id,provider,provider_job_id,dedupe_key,snapshot,source_url,match_analysis,match_analysis_version)
values
 ('11111111-aaaa-4aaa-8aaa-111111111111','abababab-abab-4bab-8bab-abababababab','fixture','blank',repeat('a',64),'{"title":"Example","descriptionText":""}','https://jobs.example/blank','{}',2),
 ('22222222-aaaa-4aaa-8aaa-222222222222','abababab-abab-4bab-8bab-abababababab','fixture','existing',repeat('b',64),'{"title":"Example","descriptionText":"Existing posting"}','https://jobs.example/existing',null,null),
 ('33333333-aaaa-4aaa-8aaa-333333333333','bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc','fixture','other-owner',repeat('c',64),'{"title":"Example","descriptionText":""}','https://jobs.example/other',null,null);
insert into public.job_resume_versions(owner_id,saved_job_id,job_snapshot,source_master_fingerprint,data)
values ('abababab-abab-4bab-8bab-abababababab','11111111-aaaa-4aaa-8aaa-111111111111','{"title":"Example","descriptionText":""}',repeat('d',64),'{}');

select ok(not has_function_privilege('anon','public.applications_fill_missing_posting(uuid,uuid,text)','execute'), 'anonymous callers cannot execute the function');
select ok(not has_function_privilege('authenticated','public.applications_fill_missing_posting(uuid,uuid,text)','execute'), 'signed-in browser callers cannot execute the function');
select ok(has_function_privilege('service_role','public.applications_fill_missing_posting(uuid,uuid,text)','execute'), 'trusted server role can execute the function');

set local role service_role;
select lives_ok($$select public.applications_fill_missing_posting('abababab-abab-4bab-8bab-abababababab','11111111-aaaa-4aaa-8aaa-111111111111',E'  Job\n description  ')$$,'fills only the owner-saved blank posting');
select is((select snapshot->>'descriptionText' from public.saved_jobs where id='11111111-aaaa-4aaa-8aaa-111111111111'),E'Job\n description','trims surrounding whitespace and preserves inner text');
select is((select revision from public.job_resume_versions where saved_job_id='11111111-aaaa-4aaa-8aaa-111111111111'),2::bigint,'updates matching job resume snapshot revision');
select throws_ok($$select public.applications_fill_missing_posting('abababab-abab-4bab-8bab-abababababab','22222222-aaaa-4aaa-8aaa-222222222222','Replacement')$$,'P0001','Posting already has description','does not replace an existing description');
select throws_ok($$select public.applications_fill_missing_posting('abababab-abab-4bab-8bab-abababababab','33333333-aaaa-4aaa-8aaa-333333333333','Other owner')$$,'P0001','Saved job not found','cannot update another owner’s saved job');
reset role;
select * from finish();
rollback;
