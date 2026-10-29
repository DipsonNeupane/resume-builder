begin;
select plan(19);

insert into auth.users(id,created_at) values
 ('71717171-7171-7171-7171-717171717171',now()-interval '30 days'),
 ('72727272-7272-7272-7272-727272727272',now()-interval '30 days');

insert into public.resumes(owner_id,data) values ('71717171-7171-7171-7171-717171717171',
 '{"version":1,"name":"Fictional","headline":"Software Engineer","email":"","phone":"","location":"","website":"","summary":"","skills":"Java","profileHeading":"Profile","skillsHeading":"Skills","sections":[{"id":"s1","title":"Experience","kind":"experience","entries":[{"id":"e1","title":"Developer","organization":"Example","location":"","dates":"","description":"Built Java services"}]}],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb);
insert into public.job_preferences(owner_id,criteria,auto_refresh) values
 ('71717171-7171-7171-7171-717171717171','{"title":"Software Engineer"}'::jsonb,true);

set local role service_role;
select is((public.jobs_reserve_provider_request('71717171-7171-7171-7171-717171717171','manual')->>'allowed')::boolean,true,'first provider request is reserved');
select is(public.jobs_reserve_provider_request('72727272-7272-7272-7272-727272727272','manual')->>'reason','rate','concurrent owners cannot exceed the provider request-per-second limit');
reset role;
update public.job_provider_requests set requested_at=requested_at-interval '2 seconds';
set local role service_role;
select is((public.jobs_reserve_provider_request('71717171-7171-7171-7171-717171717171','manual')->>'remaining')::integer,498,'provider response reports bounded remaining capacity');
reset role;
insert into public.job_provider_requests(owner_id,kind,requested_at)
 select '71717171-7171-7171-7171-717171717171','automatic',now() from generate_series(1,498);
set local role service_role;
select is((public.jobs_reserve_provider_request('71717171-7171-7171-7171-717171717171','automatic')->>'allowed')::boolean,false,'501st monthly provider request is blocked');
select is((select count(*)::integer from public.job_provider_requests where requested_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),500,'global cap never writes an overage request');

select is(jsonb_array_length(public.jobs_claim_auto_refresh(25)),1,'server cron claims a due opted-in owner with a cloud master');
select ok((select auto_refresh_lease_until>now() from public.job_preferences where owner_id='71717171-7171-7171-7171-717171717171'),'claim receives a bounded lease');
select is(public.jobs_finish_auto_refresh('71717171-7171-7171-7171-717171717171','provider_cap',null),true,'automatic refresh records provider-cap exhaustion');
select is(public.jobs_auto_refresh_result('71717171-7171-7171-7171-717171717171')->>'status','provider_cap','owner receives an honest automatic-refresh status');
select is(public.jobs_auto_refresh_result('72727272-7272-7272-7272-727272727272'),null,'another owner receives no automatic result');
select is(jsonb_array_length(public.jobs_claim_auto_refresh(25)),0,'recently finished automatic refresh is not reclaimed before 24 hours');

reset role;
insert into public.pdf_requests(id,owner_id,content_hash,cycle,counts_free,state,lease,lease_until,created_at,completed_at)
 select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'72727272-7272-7272-7272-727272727272',repeat('a',64),0,true,'complete',gen_random_uuid(),now()+interval '1 minute',now()-i*interval '1 hour',now()-i*interval '1 hour'
 from generate_series(1,7) i;
set local role service_role;
select is((select remaining from public.pdf_status('72727272-7272-7272-7272-727272727272')),0,'seven successful downloads exhaust the rolling allowance');
select ok((select resets_at>now() and resets_at<=now()+interval '7 days' from public.pdf_status('72727272-7272-7272-7272-727272727272')),'exhausted status gives the first rolling replenishment time');
reset role;
update public.pdf_requests set created_at=created_at-interval '8 days',completed_at=completed_at-interval '8 days' where owner_id='72727272-7272-7272-7272-727272727272';
set local role service_role;
select is((select remaining from public.pdf_status('72727272-7272-7272-7272-727272727272')),7,'downloads replenish individually after seven days');

set local role authenticated;
select throws_ok($$select public.jobs_reserve_provider_request('71717171-7171-7171-7171-717171717171','manual')$$,'42501','permission denied for function jobs_reserve_provider_request','browser cannot reserve global provider spend');
select throws_ok($$select public.jobs_claim_auto_refresh(25)$$,'42501','permission denied for function jobs_claim_auto_refresh','browser cannot claim automatic work');
select throws_ok($$select public.jobs_auto_refresh_result('71717171-7171-7171-7171-717171717171')$$,'42501','permission denied for function jobs_auto_refresh_result','browser cannot bypass owner-scoped API result access');
reset role;
select has_table('public','job_provider_requests','provider request ledger exists');
select has_table('public','job_auto_refresh_results','owner-scoped automatic result store exists');

select * from finish();
rollback;
