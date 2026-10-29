begin;
select plan(37);

insert into auth.users(id,created_at) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',now()-interval '1 day'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',now()-interval '1 day');
insert into public.billing_entitlements(owner_id,paid_through)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',now()+interval '30 days');
insert into public.saved_jobs(id,owner_id,provider,provider_job_id,dedupe_key,snapshot,source_url,match_analysis,match_context_hash)
values('abababab-abab-abab-abab-abababababab','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','fixture','saved-review',repeat('6',64),'{}'::jsonb,'https://jobs.example/saved-review','{}'::jsonb,repeat('6',64));
insert into public.job_resume_versions(
 id,owner_id,saved_job_id,job_snapshot,source_master_fingerprint,data
) values (
 '11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 '22222222-2222-2222-2222-222222222222',
 ('{"dedupeKey":"'||repeat('c',64)||'","title":"Private title","sourceUrl":"https://private.example/job"}')::jsonb,
 repeat('d',64),'{}'::jsonb
),(
 '77777777-7777-7777-7777-777777777777','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 '88888888-8888-8888-8888-888888888888',
 ('{"dedupeKey":"'||repeat('9',64)||'","title":"Other private title"}')::jsonb,
 repeat('8',64),'{}'::jsonb
);
insert into public.pdf_requests(id,owner_id,content_hash,cycle,counts_free,state,lease,lease_until,completed_at)
values
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('e',64),0,false,'reserved','44444444-4444-4444-4444-444444444444',now()+interval '5 minutes',null),
 ('55555555-5555-5555-5555-555555555555','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('f',64),0,false,'complete','66666666-6666-6666-6666-666666666666',now()+interval '5 minutes',now()+interval '1 second'),
 ('99999999-9999-9999-9999-999999999999','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('7',64),0,false,'complete','aaaaaaaa-1111-1111-1111-111111111111',now()+interval '5 minutes',now()+interval '1 second');

set local role authenticated;
select throws_ok($$select * from public.product_match_results$$,'42501',null,'browser cannot read issued match identities');
select throws_ok($$select * from public.product_evidence_reviews$$,'42501',null,'browser cannot read evidence-review records');
select throws_ok($$select * from public.application_package_conversions$$,'42501',null,'browser cannot read conversion records');
select throws_ok($$select * from public.product_begin_document('12121212-1212-1212-1212-121212121212','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('1',64),'modern',false,'pdf',null)$$,'42501',null,'browser cannot reserve measurement-bound exports');
select throws_ok($$select public.product_finish_document('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444',false,'pdf',null)$$,'42501',null,'browser cannot finish measurement-bound exports');
select throws_ok($$select public.product_record_evidence_review('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('c',64),repeat('a',64),'limited')$$,'42501',null,'browser cannot call evidence-review RPC');
select throws_ok($$select public.product_record_application_package('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','pdf')$$,'42501',null,'browser cannot call conversion RPC');
reset role;

set local role service_role;
select throws_ok($$select public.product_record_evidence_review('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('c',64),repeat('a',64),'preview')$$,'P0001','Invalid evidence review','review scope is closed');
select lives_ok($$select * from public.product_begin_document('12121212-1212-1212-1212-121212121212','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('1',64),'modern',false,'pdf',null)$$,'first reservation binds master document context');
select throws_ok($$select * from public.product_begin_document('12121212-1212-1212-1212-121212121212','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('1',64),'modern',false,'pdf','11111111-1111-1111-1111-111111111111')$$,'P0001','Document request context mismatch','a master request cannot later acquire a job-version context');
select lives_ok($$select public.product_register_match_results('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',array[repeat('c',64)],array[repeat('a',64)],'full')$$,'server registers a bounded Pro result before review');
select is(public.product_record_evidence_review('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('c',64),repeat('a',64),'limited')->>'scope','limited','limited requirement review is recorded');
select is(public.product_record_evidence_review('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('c',64),repeat('a',64),'full')->>'scope','full','full review upgrades the same analysis');
select is(public.product_record_evidence_review('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('c',64),repeat('a',64),'limited')->>'scope','full','a later limited view cannot downgrade full');
select is((public.product_record_evidence_review('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',repeat('c',64),repeat('a',64),'limited')->>'newlyRecorded')::boolean,false,'repeated review is identified without inflating aggregate analytics');
select is((select count(*) from public.product_evidence_reviews where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),1::bigint,'repeated views do not inflate review rows');
select lives_ok($$select public.product_register_match_results('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',array[repeat('c',64)],array[repeat('b',64)],'limited')$$,'server registers a bounded Free result before review');
select throws_ok($$select public.product_record_evidence_review('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',repeat('c',64),repeat('b',64),'full')$$,'P0001','Evidence result unavailable','Free result cannot be forged into full review scope');
select is(public.product_record_evidence_review('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',repeat('c',64),repeat('b',64),'limited')->>'scope','limited','the same job key remains owner scoped');
select lives_ok($$select public.product_register_match_results('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',array[repeat('4',64)],array[repeat('4',64)],'full')$$,'a server-issued full result still requires current Pro entitlement at review time');
select throws_ok($$select public.product_record_evidence_review('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',repeat('4',64),repeat('4',64),'full')$$,'P0001','Full evidence review unavailable','Free account cannot forge full scope from an issued identity');
select lives_ok($$select public.product_register_match_results('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',array[repeat('5',64)],array[repeat('5',64)],'limited')$$,'a limited result can be issued with bounded expiry');
reset role;
update public.product_match_results set expires_at=now()-interval '1 second' where owner_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and job_key=repeat('5',64);
set local role service_role;
select throws_ok($$select public.product_record_evidence_review('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',repeat('5',64),repeat('5',64),'limited')$$,'P0001','Evidence result unavailable','expired result identity cannot become a review');
select is(public.product_record_evidence_review('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',repeat('6',64),repeat('6',64),'limited')->>'scope','limited','current owner-saved analysis can establish review without a search-result issuance row');
reset role;
update public.saved_jobs set match_invalidated_at=now() where id='abababab-abab-abab-abab-abababababab';
set local role service_role;
select throws_ok($$select public.product_record_evidence_review('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',repeat('6',64),repeat('6',64),'limited')$$,'P0001','Evidence result unavailable','invalidated saved analysis cannot establish another review');

select is(public.product_record_application_package('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','pdf'),null,'reserved exports do not convert');
reset role;
update public.pdf_requests set document_format='pdf',job_resume_version_id='11111111-1111-1111-1111-111111111111' where id='33333333-3333-3333-3333-333333333333';
set local role service_role;
select is(public.product_finish_document('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444',true,'pdf','11111111-1111-1111-1111-111111111111'),'full','export completion and qualified conversion commit atomically');
reset role;
update public.pdf_requests set document_format='pdf',job_resume_version_id='77777777-7777-7777-7777-777777777777' where id='99999999-9999-9999-9999-999999999999';
set local role service_role;
select is(public.product_record_application_package('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','99999999-9999-9999-9999-999999999999','77777777-7777-7777-7777-777777777777','pdf'),null,'a committed export without a prior same-job review does not convert');
reset role;
update public.pdf_requests set document_format='pdf',job_resume_version_id='11111111-1111-1111-1111-111111111111' where id='55555555-5555-5555-5555-555555555555';
set local role service_role;
select is(public.product_record_application_package('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','pdf'),'full','committed same-job export converts with the reviewed scope');
select is((select count(*) from public.application_package_conversions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),2::bigint,'each distinct committed reviewed package stores one durable conversion');
select is(public.product_record_application_package('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','pdf'),'full','a completed retry returns the established conversion');
select is((select count(*) from public.application_package_conversions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),2::bigint,'completed retries do not inflate the north star');
select is(public.product_record_application_package('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','pdf'),null,'cross-owner references cannot convert');
select is((select count(*) from public.application_package_conversions where owner_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),0::bigint,'another owner receives no conversion row');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name in ('product_match_results','product_evidence_reviews','application_package_conversions') and column_name ~ '(text|url|title|company|email|name|payload|content)'),0::bigint,'measurement tables expose no content-shaped columns');
reset role;

delete from auth.users where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is((select count(*) from public.product_evidence_reviews where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),0::bigint,'account deletion removes evidence reviews');
select is((select count(*) from public.application_package_conversions where owner_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),0::bigint,'account deletion removes conversions');

rollback;
