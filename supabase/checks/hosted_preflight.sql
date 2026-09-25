-- Read-only preflight. No resume contents, credentials, or user identifiers.
-- Run before recording a migration baseline or applying later migrations.
begin read only;
select to_regclass('supabase_migrations.schema_migrations') as migration_history;
select c.relname,c.relrowsecurity,c.reltuples::bigint as estimated_rows
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;
select 'resumes' as relation,count(*) as rows from public.resumes
union all select 'resume_revisions',count(*) from public.resume_revisions;
select tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' order by tablename,policyname;
select tgname,pg_get_triggerdef(oid) as definition from pg_trigger
where tgrelid in ('public.resumes'::regclass,'public.resume_revisions'::regclass) and not tgisinternal;
select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns
where table_schema='public' and table_name in ('resumes','resume_revisions') order by table_name,ordinal_position;
select routine_name,grantee,privilege_type from information_schema.routine_privileges
where specific_schema='public' order by routine_name,grantee;
commit;
