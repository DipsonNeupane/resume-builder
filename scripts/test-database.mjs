import { PGlite } from '@electric-sql/pglite';
import { pgtap } from '@electric-sql/pglite-pgtap';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// Real Postgres RLS/triggers in WASM, with a minimal Supabase auth schema.
// Does not substitute for testing hosted Auth/PostgREST/session verification.
//
// Migrations are applied in filename order (the existing YYYYMMDDHHMMSS_*
// naming convention already sorts chronologically), and every *.test.sql
// file under supabase/tests/ is then run, also in filename order. Each test
// file wraps its own `begin ... rollback`, so running several against the
// same live database in sequence is safe: none of them leave residue for
// the next.
const migrationsDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const testsDir = fileURLToPath(new URL('../supabase/tests/', import.meta.url));

async function sqlFilesInOrder(dir) {
  const entries = await readdir(dir);
  return entries.filter((name) => name.endsWith('.sql')).sort();
}

const db = new PGlite({ extensions: { pgtap } });
try {
  await db.exec(`
    create extension pgtap;
    create role anon nologin;
    create role service_role nologin bypassrls;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key, instance_id uuid, aud text, role text, email text,
      encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz,
      updated_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
      is_super_admin boolean
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);

  const migrationFiles = await sqlFilesInOrder(migrationsDir);
  if (migrationFiles.length === 0) throw new Error(`No migration files found in ${migrationsDir}`);
  for (const file of migrationFiles) {
    await db.exec(await readFile(path.join(migrationsDir, file), 'utf8'));
    if (file === '20260918120000_resume_storage.sql') {
      // A historical document predates new shape/limits; NOT VALID must preserve it.
      await db.exec(`insert into auth.users(id) values ('99999999-9999-9999-9999-999999999999');
        insert into public.resumes(owner_id,data) values ('99999999-9999-9999-9999-999999999999','{"name":"Legacy"}');
        update public.resumes set data='{"name":"Legacy edited"}' where owner_id='99999999-9999-9999-9999-999999999999';`);
    }

  }


  const historical = await db.query(`select l.lifetime_revision_count::text as counted,
    l.lifetime_revision_bytes::text as bytes,
    (select sum(octet_length(data::text))::text from public.resume_revisions where owner_id=l.owner_id) as actual
    from public.resume_owner_limits l where owner_id='99999999-9999-9999-9999-999999999999'`);
  assert.equal(historical.rows[0]?.counted, '2');
  assert.equal(historical.rows[0]?.bytes, historical.rows[0]?.actual);
  // Reconciliation cannot reset counters retained after document deletion.
  await db.exec(`delete from public.resumes where owner_id='99999999-9999-9999-9999-999999999999'`);
  await db.exec(await readFile(path.join(migrationsDir, '20260919160000_resume_history_accounting.sql'), 'utf8'));
  const retained=await db.query(`select lifetime_revision_count::text as counted from public.resume_owner_limits where owner_id='99999999-9999-9999-9999-999999999999'`);
  assert.equal(retained.rows[0]?.counted,'2');
  await db.exec(`delete from auth.users where id='99999999-9999-9999-9999-999999999999'`);
  console.log('Historical accounting assertions passed: count, bytes, retained counters.');
  const testFiles = await sqlFilesInOrder(testsDir);
  if (testFiles.length === 0) throw new Error(`No test files found in ${testsDir}`);
  let anyFailed = false;
  let filesWithoutPlan = 0;
  for (const file of testFiles) {
    console.log(`-- running ${file} --`);
    const results = await db.exec(await readFile(path.join(testsDir, file), 'utf8'));
    const lines = results.flatMap((result) => result.rows.flatMap((row) => Object.values(row))).filter((value) => typeof value === 'string');
    console.log(`-- ${file} --`);
    console.log(lines.join('\n'));
    if (lines.some((line) => /^not ok|^# Looks like/m.test(line))) anyFailed = true;
    if (!lines.some((line) => /^1\.\./.test(line))) filesWithoutPlan++;
  }
  if (anyFailed || filesWithoutPlan > 0) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
