begin;
select plan(2);
select is((select count(*)::integer from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in
 ('resume_strings_ok','resume_entry_ok','resume_section_ok','resume_sections_ok','resume_data_is_valid')
 and 'search_path=""'=any(p.proconfig)),5,'all resume validators pin empty search path');
create schema hostile_validation_fixture;
create function hostile_validation_fixture.length(text) returns integer language sql immutable as $$select 0$$;
set local search_path = hostile_validation_fixture, pg_catalog, public;
select is(public.resume_strings_ok('{"name":"long"}'::jsonb,array['name'],1),false,
 'caller search path cannot replace validation builtin');
select * from finish();
rollback;
