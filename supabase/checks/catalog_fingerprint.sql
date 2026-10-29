-- Read-only schema fingerprint of the public schema. Schema metadata only: no table rows,
-- no resume content, no identifiers, no credentials. Run it on production and on the staging
-- database before the rehearsal and compare the outputs line by line (diff); staging must
-- start from production's actual state, including its recorded drift.
-- Usage: psql "$DB_URL" -X -A -t -v ON_ERROR_STOP=1 -f supabase/checks/catalog_fingerprint.sql > fingerprint.txt
begin read only;
select 'migration_ledger|' || coalesce(to_regclass('supabase_migrations.schema_migrations')::text, 'absent');
select 'table|' || c.relname || '|rls=' || c.relrowsecurity || '|force=' || c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;
select 'column|' || table_name || '.' || column_name || '|' || data_type || '|null=' || is_nullable || '|default=' || coalesce(column_default, '')
from information_schema.columns where table_schema = 'public' order by 1;
select 'constraint|' || conrelid::regclass::text || '.' || conname || '|valid=' || convalidated || '|' || md5(pg_get_constraintdef(oid))
from pg_constraint where connamespace = 'public'::regnamespace order by 1;
select 'index|' || indexrelid::regclass::text || '|' || md5(pg_get_indexdef(indexrelid))
from pg_index i join pg_class c on c.oid = i.indrelid where c.relnamespace = 'public'::regnamespace order by 1;
select 'function|' || p.oid::regprocedure::text || '|definer=' || p.prosecdef || '|config=' || coalesce(array_to_string(p.proconfig, ','), '') || '|' || md5(pg_get_functiondef(p.oid))
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1;
select 'trigger|' || tgrelid::regclass::text || '.' || tgname || '|' || md5(pg_get_triggerdef(oid))
from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace) order by 1;
select 'policy|' || tablename || '.' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
from pg_policies where schemaname = 'public' order by 1;
select 'table_grant|' || table_name || '|' || grantee || '|' || string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
group by table_name, grantee order by 1;
select 'routine_grant|' || p.oid::regprocedure::text || '|' || coalesce(array_to_string(p.proacl, ','), 'default')
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1;
commit;
