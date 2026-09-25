-- pgTAP ownership/RLS tests for supabase/migrations/20260918120000_resume_storage.sql.
--
-- Run locally without Docker: npm run test:db (PGlite/Postgres + minimal auth schema).
-- Also run against the Supabase local stack before production enablement.
-- The local harness does not test hosted Auth or PostgREST configuration.
--
-- Setup (owner or a future agent with CLI/Docker access):
--   1. `supabase start` (local stack, includes the `auth` schema and pgTAP).
--   2. `supabase db reset` (applies migrations in supabase/migrations/).
--   3. `supabase test db` — runs every *.test.sql file under supabase/tests/
--      through pgTAP automatically. Or run this file directly:
--      `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/tests/resumes_rls.test.sql`
--
-- Two fake auth.users rows are inserted directly (as the superuser role this
-- script runs as) purely to satisfy the resumes.owner_id foreign key; no real
-- login/credential path is exercised.
--
-- Every `data` fixture below is a full, valid Resume-shaped JSON object
-- (version/headline/profileHeading/.../noExperience all present), not the
-- original minimal `{"name":"..."}` stub this file used before
-- supabase/migrations/20260919150000_resume_storage_bounds.sql added
-- resumes_data_shape_valid. That CHECK constraint is enforced for every new
-- write regardless of NOT VALID's grace period for pre-existing rows (see
-- that migration's own comments), so a minimal stub now fails every legitimate
-- insert/update in this file with 23514 before its actual assertion is ever
-- reached. Only the varying `name` field is test-meaningful; every other
-- field is filler needed purely to satisfy the shape constraint. Writes that
-- are expected to fail on grounds unrelated to shape (RLS ownership,
-- resume_revisions' revoked grant, a stale/zero-row-matching WHERE clause)
-- were left as informative minimal fixtures where the shape genuinely
-- doesn't matter, but were mostly normalized too for consistency.

begin;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user-a@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user-b@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false);

-- Acting as user A: create their resume.
set local role authenticated;
set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- A fixed id (rather than the auto-generated default) so later assertions can
-- name this exact row without needing a role-crossing lookup.
select lives_ok(
  $$insert into public.resumes (id, owner_id, data) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', '{"version":1,"name":"A","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  'user A can insert their own resume'
);

select is(
  (select count(*)::int from public.resumes where owner_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'user A sees exactly their own resume row'
);

select is(
  (select revision from public.resumes where owner_id = '11111111-1111-1111-1111-111111111111'),
  1::bigint,
  'a freshly inserted resume starts at revision 1, regardless of client input'
);

select is(
  (select count(*)::int from public.resume_revisions where owner_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'inserting a resume writes exactly one checkpoint row'
);

select throws_ok(
  $$insert into public.resumes (owner_id, data) values ('11111111-1111-1111-1111-111111111111', '{"version":1,"name":"A duplicate","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  '23505', null,
  'a second resume for the same owner is rejected by the one-resume-per-account constraint'
);

-- Own-account forgery: user A tries to insert a checkpoint claiming a future
-- revision (99) against their OWN resume_id/owner_id — everything an
-- ownership-only or "exists" check would accept. This is the exact gap the
-- fix closes: resume_revisions has no INSERT grant for `authenticated` at
-- all, so this fails at the privilege-check level before any policy is even
-- consulted, regardless of how legitimate the row's own/resume_id look.
select throws_ok(
  $$insert into public.resume_revisions (resume_id, owner_id, revision, data) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 99, '{"name":"forged future checkpoint"}'::jsonb)$$,
  '42501', null,
  'user A cannot forge their own future checkpoint by inserting directly, even against their own resume_id and owner_id'
);

-- Same forgery attempt but at revision 2 (a plausible *next* revision, not an
-- obviously-fake 99) landing in the table before the real update happens —
-- this is the "suppress the real checkpoint" attack: if this insert
-- succeeded, the later legitimate save's trigger-written row for revision 2
-- would collide with it. Confirmed blocked the same way.
select throws_ok(
  $$insert into public.resume_revisions (resume_id, owner_id, revision, data) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 2, '{"name":"pre-occupied checkpoint slot"}'::jsonb)$$,
  '42501', null,
  'user A cannot pre-occupy an upcoming (resume_id, revision) slot to suppress the real trigger-written checkpoint'
);

-- Optimistic concurrency: update with the correct current revision succeeds.
select is(
  (select count(*)::int from public.resumes where owner_id = '11111111-1111-1111-1111-111111111111' and revision = 1),
  1,
  'sanity: resume is still at revision 1 before the concurrency check'
);

with updated as (
  update public.resumes set data = '{"version":1,"name":"A v2","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb
  where owner_id = '11111111-1111-1111-1111-111111111111' and revision = 1
  returning revision
)
select is((select revision from updated), 2::bigint, 'updating against the correct expected revision succeeds and advances it to 2');

-- Confirms the genuine trigger-written checkpoint for revision 2 actually
-- landed with the real data — i.e. the earlier blocked forgery attempt at
-- the same (resume_id, revision=2) slot did not get there first and silently
-- absorb this write via `on conflict do nothing` (now removed).
select is(
  (select count(*)::int from public.resume_revisions where owner_id = '11111111-1111-1111-1111-111111111111'),
  2,
  'both the initial insert and the update produced their own real checkpoint row'
);
select is(
  (select data->>'name' from public.resume_revisions where owner_id = '11111111-1111-1111-1111-111111111111' and revision = 2),
  'A v2',
  'the revision-2 checkpoint holds the genuine saved data, not a forged placeholder'
);

-- Optimistic concurrency: update against a now-stale revision matches zero rows
-- instead of overwriting the newer save. This is the client's conflict signal.
with updated as (
  update public.resumes set data = '{"version":1,"name":"A stale write","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb
  where owner_id = '11111111-1111-1111-1111-111111111111' and revision = 1
  returning revision
)
select is((select count(*)::int from updated), 0, 'updating against a stale expected revision affects zero rows (conflict, not overwrite)');

select is(
  (select data->>'name' from public.resumes where owner_id = '11111111-1111-1111-1111-111111111111'),
  'A v2',
  'the stale write above did not change the stored data'
);

-- Switch to user B: must not see or affect user A's resume at all.
set local request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.resumes where owner_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'user B cannot see user A''s resume row (RLS select scoping)'
);

with updated as (
  update public.resumes set data = '{"version":1,"name":"hijacked","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb
  where owner_id = '11111111-1111-1111-1111-111111111111'
  returning 1
)
select is((select count(*)::int from updated), 0, 'user B''s update against user A''s row affects zero rows');

set local request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
select is(
  (select data->>'name' from public.resumes where owner_id = '11111111-1111-1111-1111-111111111111'),
  'A v2',
  'user A''s data is unchanged after user B''s attempted update'
);
set local request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';

select throws_ok(
  $$insert into public.resumes (owner_id, data) values ('11111111-1111-1111-1111-111111111111', '{"version":1,"name":"B pretending to be A","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  '42501', null,
  'user B cannot insert a resume claiming to be owned by user A'
);

select is(
  (select count(*)::int from public.resume_revisions where owner_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'user B cannot read user A''s checkpoint history either'
);

-- The cross-account forgery this table's design specifically blocks: user B
-- claims ownership of the checkpoint row (owner_id = B) while pointing
-- resume_id at user A's resume. Like every other direct-insert attempt in
-- this file, this fails at the revoked-grant check before any policy (or the
-- resume_revisions_unique(resume_id, revision) constraint) is even reached —
-- revision 99 keeps this test's intent readable even though the grant alone
-- is already sufficient to block it.
select throws_ok(
  $$insert into public.resume_revisions (resume_id, owner_id, revision, data) values ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 99, '{"name":"forged"}'::jsonb)$$,
  '42501', null,
  'user B cannot forge a checkpoint against user A''s resume_id even while claiming it as their own owner_id'
);

-- Sanity: the tightened policy does not break the legitimate path — user B
-- can still create their own resume, and its trigger-written checkpoint
-- (resume_id and owner_id both genuinely B's) still succeeds.
select lives_ok(
  $$insert into public.resumes (owner_id, data) values ('22222222-2222-2222-2222-222222222222', '{"version":1,"name":"B own resume","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  'user B can still insert their own resume under the tightened resume_revisions policy'
);

with removed as (
  delete from public.resumes where owner_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is((select count(*)::int from removed), 0, 'user B cannot delete user A resume');
set local role anon;
select throws_ok($$select * from public.resumes$$, '42501', null, 'anonymous cannot read resumes');
select throws_ok($$select * from public.resume_revisions$$, '42501', null, 'anonymous cannot read revision history');
select throws_ok($$insert into public.resumes(owner_id,data) values ('11111111-1111-1111-1111-111111111111','{}')$$, '42501', null, 'anonymous cannot create resumes');
reset role;
select * from finish();
rollback;
