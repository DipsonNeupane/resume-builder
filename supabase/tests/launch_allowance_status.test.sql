begin;
select plan(4);
insert into auth.users(id,created_at) values ('73737373-7373-7373-7373-737373737373',now()-interval '30 days');
set local role service_role;
select is((select resets_at from public.pdf_status('73737373-7373-7373-7373-737373737373')),null,'no counted download means no reset time is claimed');
reset role;
insert into public.pdf_requests(id,owner_id,content_hash,cycle,counts_free,state,lease,lease_until,created_at,completed_at) values
 ('00000000-0000-0000-0000-000000007301','73737373-7373-7373-7373-737373737373',repeat('b',64),0,true,'complete',gen_random_uuid(),now(),now()-interval '2 days',now()-interval '2 days'),
 ('00000000-0000-0000-0000-000000007302','73737373-7373-7373-7373-737373737373',repeat('c',64),0,true,'failed',gen_random_uuid(),now(),now()-interval '3 days',null);
set local role service_role;
select is((select remaining from public.pdf_status('73737373-7373-7373-7373-737373737373')),6,'a failed download does not consume the allowance');
select ok((select resets_at between now()+interval '4 days 23 hours' and now()+interval '5 days 1 minute' from public.pdf_status('73737373-7373-7373-7373-737373737373')),'reset is when the oldest counted download leaves the window');
select is((select remaining+0 from public.pdf_status('73737373-7373-7373-7373-737373737373')),7-1,'status matches the seven-download launch allowance');
select * from finish();
rollback;
