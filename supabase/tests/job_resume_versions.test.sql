begin;
select plan(24);

insert into auth.users(id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.billing_entitlements(owner_id,paid_through) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',now()+interval '30 days');
insert into public.resumes(id,owner_id,data) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"version":1,"name":"Master","headline":"Engineer","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb);
insert into public.saved_jobs(id,owner_id,provider,provider_job_id,dedupe_key,snapshot,source_url)
values
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','fixture','one',repeat('a',64),
  '{"title":"Engineer","company":"Example","descriptionText":"Required: TypeScript"}'::jsonb,'https://jobs.example/one'),
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','fixture','two',repeat('b',64),
  '{"title":"Designer","company":"Other","descriptionText":"Required: Figma"}'::jsonb,'https://jobs.example/two');

set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok($$select * from public.job_resume_versions$$,'42501',null,'browser cannot read job-specific resumes directly');
select throws_ok($$select public.job_resume_versions_list('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,'42501',null,'browser cannot call the list RPC');
select throws_ok($$select public.job_resume_master('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,'42501',null,'browser cannot call the authoritative-master RPC');
select throws_ok($$select public.job_resume_version_create('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','{}',repeat('a',64))$$,'42501',null,'browser cannot create a version directly');
select throws_ok($$select public.job_tailoring_inputs('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333')$$,'42501',null,'browser cannot derive tailoring inputs directly');
reset role;

set local role service_role;
select throws_ok($$select public.job_resume_version_create('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','{}',repeat('b',64))$$,'P0001','Active Pro required','new version creation requires active Pro');
select lives_ok($$select public.job_resume_version_create('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','{"name":"Master"}',repeat('a',64))$$,'Pro owner can create a job-specific version when tailoring begins');
select is((select count(*) from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),1::bigint,'one version is created');
select is((select source_master_resume_id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'11111111-1111-1111-1111-111111111111'::uuid,'source master identity is retained');
select is((select source_master_revision from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),1::bigint,'source master revision is retained');
select lives_ok($$select public.job_resume_version_create('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','{"name":"different"}',repeat('b',64))$$,'restarting tailoring reuses the existing active version');
select is((select count(*) from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),1::bigint,'duplicate active versions are prevented');
select is(public.job_tailoring_inputs('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))#>>'{job,descriptionText}','Required: TypeScript','tailoring uses the actual owner-bound saved job description');
select is(public.job_tailoring_inputs('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))#>>'{resume,name}','Master','tailoring uses the active persisted job-resume version');
select throws_ok($$select public.job_tailoring_inputs('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))$$,'P0001','Tailoring source not found','a version cannot be rebound to another saved job owned by the same account');
select throws_ok($$select public.job_tailoring_inputs('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))$$,'P0001','Tailoring source not found','another owner cannot bind a tailoring request to the version');
select throws_ok($$select public.job_resume_version_get('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))$$,'P0001','Job resume not found','another account cannot load the version');
select throws_ok($$select public.job_resume_version_update('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),9,'{"name":"stale"}')$$,'P0001','Job resume conflict','stale writes cannot overwrite newer content');
select is(public.job_resume_version_update('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),1,'{"name":"Tailored"}')#>>'{data,name}','Tailored','current revision update persists manual or accepted AI changes');
select is((select revision from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),2::bigint,'successful update advances the optimistic revision');

reset role;
delete from public.saved_jobs where id='22222222-2222-2222-2222-222222222222';
delete from public.resumes where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.billing_entitlements set paid_through=now()-interval '1 day' where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local role service_role;
select is((select count(*) from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),1::bigint,'saved-job and master deletion do not cascade-delete the version');
select is(public.job_resume_version_get('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))#>>'{data,name}','Tailored','expired Pro still has access to existing content');
select is((public.job_resume_versions_list('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')->0->>'savedJobExists')::boolean,false,'removed saved job is reported without losing its resume');
select is(public.job_resume_version_reset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',(select id from public.job_resume_versions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),2,'{"name":"New master"}',repeat('c',64))#>>'{data,name}','New master','explicit update-from-master resets only after confirmation and does not require renewed Pro');

rollback;
