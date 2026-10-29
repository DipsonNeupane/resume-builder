begin;
select plan(19);

insert into auth.users(id,created_at) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',now()),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',now());
insert into public.saved_jobs(id,owner_id,provider,provider_job_id,dedupe_key,snapshot,source_url)
values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','fixture','one',repeat('1',64),'{}','https://example.test/one'),
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','fixture','two',repeat('2',64),'{}','https://example.test/two');

set local role authenticated;
select throws_ok($$select * from public.product_outcome_reports$$,'42501',null,'browser cannot read outcome records directly');
select throws_ok($$select public.product_outcome_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','offer_received',current_date,null,null,null,true,'outcomes-v1')$$,'42501',null,'browser cannot call the reporting RPC');
reset role;

set local role service_role;
select lives_ok($$select public.product_outcome_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','application_prepared',current_date,'15_to_30_minutes',4,3,true,'outcomes-v1')$$,'consented self-report is accepted');
select is((select provenance from public.product_outcome_reports where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'self_reported','provenance cannot be confused with observed behavior');
select is((select consent_version from public.product_outcome_reports where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'outcomes-v1','consent version is retained');
select is((select count(*) from public.product_outcome_reports),1::bigint,'one bounded report is stored');
select lives_ok($$select public.product_outcome_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','application_prepared',current_date,'31_to_60_minutes',5,4,true,'outcomes-v1')$$,'same outcome can be corrected');
select is((select count(*) from public.product_outcome_reports),1::bigint,'a correction does not inflate sample size');
select is((select clarity_rating from public.product_outcome_reports),5::smallint,'corrected bounded feedback is retained');
select throws_ok($$select public.product_outcome_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','offer_received',current_date,null,null,null,false,'outcomes-v1')$$,'P0001','Invalid outcome report','explicit consent is required');
select throws_ok($$select public.product_outcome_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','hired',current_date,null,null,null,true,'outcomes-v1')$$,'P0001','Invalid outcome report','outcomes use a closed vocabulary');
select throws_ok($$select public.product_outcome_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','offer_received',current_date + 1,null,null,null,true,'outcomes-v1')$$,'P0001','Invalid outcome report','future outcome dates are rejected');
select throws_ok($$select public.product_outcome_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','offer_received',current_date,'about an hour',null,null,true,'outcomes-v1')$$,'P0001','Invalid outcome report','time feedback is bucketed');
select throws_ok($$select public.product_outcome_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','offer_received',current_date,null,6,null,true,'outcomes-v1')$$,'P0001','Invalid outcome report','ratings are bounded');
select throws_ok($$select public.product_outcome_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','offer_received',current_date,null,null,null,true,'outcomes-v1')$$,'P0001','Saved job not found','another owner job cannot be used');
select is(jsonb_array_length(public.product_outcome_reports_list('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),1,'owner can be summarized through service boundary');
select is(jsonb_array_length(public.product_outcome_reports_list('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),0,'other owner has no report');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='product_outcome_reports' and column_name in ('resume_text','job_text','job_url','notes','contact_details')),'outcome schema contains no content fields');
select ok(product_outcome_reports_list('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')->0 ? 'id','report has a durable identifier for methodology/sample accounting');
reset role;

select * from finish();
rollback;
