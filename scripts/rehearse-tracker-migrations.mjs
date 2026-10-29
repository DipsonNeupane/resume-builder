import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
// Local, offline rehearsal of the launch migrations on a fresh PGlite database. It seeds
// fictional rows in the previous application shape just before the launch migrations, runs
// supabase/checks/tracker_rehearsal_before.sql and _after.sql, and never connects anywhere.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const db = new PGlite();
await db.exec(`create role anon nologin; create role service_role nologin bypassrls; create role authenticated nologin; create schema auth;
create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key);`);
const dir = path.join(root, 'supabase/migrations');
const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
const run = async label => { const check = await readFile(path.join(root, `supabase/checks/tracker_rehearsal_${label.toLowerCase()}.sql`), 'utf8'); const res = await db.exec(check); console.log(label, JSON.stringify(res.filter(r => r.rows.length).map(r => r.rows))); };
let seeded = false;
for (const f of files) {
  if (f.startsWith('20261027100000') && !seeded) {
    // Fictional pre-launch rows in the previous shape.
    await db.exec(`insert into auth.users(id) values ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4');
      insert into public.saved_jobs(id, owner_id, provider, provider_job_id, dedupe_key, source_url, snapshot)
      select ('00000000-0000-4000-8000-00000000000'||n)::uuid, 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', 'techmap', n::text, repeat(n::text, 64), 'https://jobs.example/'||n, '{}'::jsonb from generate_series(1,4) n;
      insert into public.job_application_workflows(owner_id, saved_job_id, decision, application_status)
      values ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','00000000-0000-4000-8000-000000000001','review','not_applied'),
             ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','00000000-0000-4000-8000-000000000002','pursue','interviewing'),
             ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','00000000-0000-4000-8000-000000000003','pursue','withdrawn'),
             ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','00000000-0000-4000-8000-000000000004','pass','not_applied');
      insert into public.job_application_history(owner_id, saved_job_id, decision, application_status)
      values ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','00000000-0000-4000-8000-000000000002','pursue','interviewing');`);
    seeded = true;
    try { await run('BEFORE'); } catch (e) { console.log('BEFORE error', e.message); }
  }
  await db.exec(await readFile(path.join(dir, f), 'utf8'));
  await db.exec(`insert into supabase_migrations.schema_migrations values ('${f.slice(0, 14)}') on conflict do nothing`);
}
try { await run('AFTER'); } catch (e) { console.log('AFTER error', e.message); process.exitCode = 1; }
const stages = await db.query(`select application_status, stage, closed_reason from public.job_application_workflows order by saved_job_id`);
console.log('CONVERTED', JSON.stringify(stages.rows));
await db.close();
