-- pgTAP tests for supabase/migrations/20260919150000_resume_storage_bounds.sql.
--
-- Run locally without Docker: npm run test:db (PGlite/Postgres + minimal auth
-- schema; scripts/test-database.mjs applies every file in supabase/migrations/
-- in filename order, then runs every file in supabase/tests/ in filename
-- order, this one included). Also run against the Supabase local stack
-- before production enablement, same as supabase/tests/resumes_rls.test.sql.
--
-- This file is specifically about the NEW history-count/aggregate-bytes/
-- write-rate caps and the new JSON shape validation added by the bounds
-- migration. It does not re-test plain ownership/RLS scoping — that is
-- already covered by resumes_rls.test.sql and is not duplicated here.
--
-- IMPORTANT: resume_owner_limits and resume_limit_config have NO grant at
-- all for `authenticated` (by design — see the migration's own comments),
-- so every verification read against them below runs after `reset role`
-- (back to this script's own superuser context), never while `set local
-- role authenticated` is active. Reading them as `authenticated` would
-- itself throw 42501, which is exactly what the dedicated privilege tests
-- near the top intentionally check for — don't confuse that intentional
-- failure with an accidental one in a verification step.
--
-- Every UPDATE below targets an exact `revision` value. Because each write
-- deterministically advances the row's revision by exactly 1 (via the prior
-- migration's resumes_set_revision trigger, unchanged), and pgTAP tests in
-- this file run strictly in order within one transaction, the expected
-- revision at each step is traced in a comment immediately above it — read
-- them in order if editing this file, since a reordered or removed
-- statement will desynchronize every later revision number.

begin;
select plan(42);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user-c@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'user-d@example.com', 'not-a-real-hash', now(), now(), now(), '{}', '{}', false);

-- ===== As user C: ordinary save/update/stale-conflict behavior is unchanged =====
set local role authenticated;
set local request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

-- A fully valid resume matching src/model.ts's Resume shape exactly,
-- including the fields the app always sends (profileHeading, skillsHeading,
-- noExperience, and an explicit section.kind).
select lives_ok(
  $$insert into public.resumes (owner_id, data) values ('33333333-3333-3333-3333-333333333333', '{"version":1,"name":"Carla","headline":"Engineer","email":"carla@example.com","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills & languages","sections":[{"id":"s1","title":"Experience","kind":"experience","entries":[{"id":"e1","title":"Role","organization":"Org","location":"","dates":"","description":""}]}],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  'a fully valid resume insert succeeds under the new shape/limit triggers'
);
reset role;
select is(
  (select lifetime_revision_count from public.resume_owner_limits where owner_id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'the insert above recorded exactly one lifetime checkpoint for its owner'
);
set local role authenticated;
set local request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

-- C is now at revision 1; this update targets it and should succeed.
with updated as (
  update public.resumes set data = data || '{"name":"Carla V2"}'::jsonb
  where owner_id = '33333333-3333-3333-3333-333333333333' and revision = 1
  returning revision
)
select is((select revision from updated), 2::bigint, 'an ordinary update still succeeds and advances the revision');
reset role;
select is(
  (select lifetime_revision_count from public.resume_owner_limits where owner_id = '33333333-3333-3333-3333-333333333333'),
  2::bigint,
  'the update above advanced the lifetime checkpoint counter to 2'
);
select is(
  (select rate_window_count from public.resume_owner_limits where owner_id = '33333333-3333-3333-3333-333333333333'),
  2,
  'sanity: rate window count is 2 (one per successful write) before the stale-write attempt'
);
set local role authenticated;
set local request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

-- C is now at revision 2; targeting the now-stale revision 1 matches zero
-- rows, so the BEFORE trigger never fires for any row at all.
with updated as (
  update public.resumes set data = data || '{"name":"stale"}'::jsonb
  where owner_id = '33333333-3333-3333-3333-333333333333' and revision = 1
  returning revision
)
select is((select count(*)::int from updated), 0, 'a stale-revision update still matches zero rows (existing conflict behavior, unaffected by the new triggers)');
reset role;
select is(
  (select lifetime_revision_count from public.resume_owner_limits where owner_id = '33333333-3333-3333-3333-333333333333'),
  2::bigint,
  'the stale-write attempt above did not increment the lifetime checkpoint counter'
);
select is(
  (select rate_window_count from public.resume_owner_limits where owner_id = '33333333-3333-3333-3333-333333333333'),
  2,
  'the stale-write attempt above did not consume a rate-limit slot either'
);

-- ===== As user D: JSON shape rejections =====
-- (D has zero resumes at this point; every insert below targets D's own
-- owner_id under D's own session, so RLS's own-account check passes and any
-- rejection below is purely the new shape constraint, not RLS.)
set local role authenticated;
set local request.jwt.claim.sub to '44444444-4444-4444-4444-444444444444';
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select throws_ok(
  $$insert into public.resumes (owner_id, data) values ('44444444-4444-4444-4444-444444444444', '{"version":2,"name":"D","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  '23514', null,
  'a resume with the wrong version number is rejected'
);
select throws_ok(
  $$insert into public.resumes (owner_id, data) values ('44444444-4444-4444-4444-444444444444', '{"version":1,"name":"D","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"bogus","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  '23514', null,
  'a resume with an out-of-enum template value is rejected'
);
select throws_ok(
  $$insert into public.resumes (owner_id, data) values ('44444444-4444-4444-4444-444444444444', '{"version":1,"name":"D","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"not-a-color","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  '23514', null,
  'a resume with a malformed accent color is rejected'
);
select throws_ok(
  $$insert into public.resumes (owner_id, data) values ('44444444-4444-4444-4444-444444444444', '{"version":1,"name":"D","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":"not-an-array","template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  '23514', null,
  'a resume whose sections field is not an array is rejected (and does not crash the write with an uncaught error)'
);
select throws_ok(
  $$insert into public.resumes (owner_id, data) values ('44444444-4444-4444-4444-444444444444', '{"version":1,"name":"D","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[{"id":"s1","title":"T","kind":"bogus","entries":[]}],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  '23514', null,
  'a resume with an out-of-enum section.kind is rejected'
);
select throws_ok(
  $$insert into public.resumes (owner_id, data) values ('44444444-4444-4444-4444-444444444444', '{"version":1,"name":"D","headline":"H","email":"","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[{"id":"s1","title":"T","entries":[{"id":"e1","title":"x","organization":"","location":"","dates":"","description":""}]}],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":"yes"}'::jsonb)$$,
  '23514', null,
  'a resume with a non-boolean noExperience value is rejected'
);
select throws_ok(
  $$insert into public.resumes (owner_id, data)
    select '44444444-4444-4444-4444-444444444444',
      jsonb_build_object(
        'version',1,'name','D','headline','H','email','','phone','','location','','website','','summary','','skills','',
        'profileHeading','Profile','skillsHeading','Skills',
        'sections',(select jsonb_agg(jsonb_build_object('id','s'||g,'title','T','entries','[]'::jsonb)) from generate_series(1,31) as g),
        'template','modern','paper','A4','accent','#20594a','direction','ltr','language','en','noExperience',false
      )$$,
  '23514', null,
  '31 sections (over the 30-section cap) is rejected'
);

-- Legacy tolerance: a resume entirely missing noExperience and every
-- section's kind (the exact pre-migrate() shape src/model.ts's migrate()
-- exists to upgrade) is still ACCEPTED, not rejected — proves the shape
-- constraint deliberately tolerates absence, not just leniency of type. This
-- is D's first successful resume (every attempt above was rejected/rolled
-- back), so D is now at revision 1.
select lives_ok(
  $$insert into public.resumes (owner_id, data) values ('44444444-4444-4444-4444-444444444444', '{"version":1,"name":"D","headline":"H","email":"d@example.com","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[{"id":"s1","title":"Experience","entries":[{"id":"e1","title":"Role","organization":"","location":"","dates":"","description":""}]}],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en"}'::jsonb)$$,
  'a legacy resume missing noExperience and every section.kind is still accepted, matching migrate() semantics'
);

-- ===== Direct client access to the new abuse-prevention tables is blocked =====
select throws_ok(
  $$insert into public.resume_owner_limits (owner_id) values ('33333333-3333-3333-3333-333333333333')$$,
  '42501', null,
  'a client cannot insert directly into resume_owner_limits'
);
select throws_ok(
  $$select * from public.resume_owner_limits$$,
  '42501', null,
  'a client cannot read resume_owner_limits directly'
);
select throws_ok(
  $$update public.resume_limit_config set max_revisions_per_owner = 1 where id = true$$,
  '42501', null,
  'a client cannot alter the configured caps'
);

-- ===== Spoofed owner_id on UPDATE cannot redirect bookkeeping =====
-- Switch back to user C, who updates their OWN row (satisfies RLS USING)
-- but includes owner_id = user D's id in the SET payload — the shape of a
-- hand-crafted PostgREST PATCH request, not something this app's own client
-- code sends. C is currently at revision 2 (unaffected by the D-only
-- section above).
reset role;
select is(
  (select lifetime_revision_count from public.resume_owner_limits where owner_id = '44444444-4444-4444-4444-444444444444'),
  1::bigint,
  'sanity: user D currently has exactly 1 recorded lifetime checkpoint before the spoofing attempt'
);
set local role authenticated;
set local request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
with updated as (
  update public.resumes set data = data || '{"name":"Carla V3"}'::jsonb, owner_id = '44444444-4444-4444-4444-444444444444'
  where owner_id = '33333333-3333-3333-3333-333333333333' and revision = 2
  returning owner_id
)
select is((select owner_id from updated), '33333333-3333-3333-3333-333333333333'::uuid, 'the final row is still owned by the real caller, not the spoofed owner_id in the payload (existing resumes_set_revision behavior)');
reset role;
select is(
  (select lifetime_revision_count from public.resume_owner_limits where owner_id = '44444444-4444-4444-4444-444444444444'),
  1::bigint,
  'the spoofing attempt above did NOT charge the spoofed owner_id''s (user D''s) checkpoint counter'
);
select is(
  (select lifetime_revision_count from public.resume_owner_limits where owner_id = '33333333-3333-3333-3333-333333333333'),
  3::bigint,
  'the spoofing attempt above correctly charged the real caller (user C), not the spoofed target'
);

-- ===== Delete/recreate does not reset lifetime history bookkeeping =====
-- C is now at revision 3 (from the spoofed-but-self-owned update above).
set local role authenticated;
set local request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
with removed as (
  delete from public.resumes where owner_id = '33333333-3333-3333-3333-333333333333' returning 1
)
select is((select count(*)::int from removed), 1, 'user C can delete their own resume (account/document deletion remains unrestricted)');
select lives_ok(
  $$insert into public.resumes (owner_id, data) values ('33333333-3333-3333-3333-333333333333', '{"version":1,"name":"Carla fresh","headline":"H","email":"c@example.com","phone":"","location":"","website":"","summary":"","skills":"","profileHeading":"Profile","skillsHeading":"Skills","sections":[],"template":"modern","paper":"A4","accent":"#20594a","direction":"ltr","language":"en","noExperience":false}'::jsonb)$$,
  'user C can create a brand-new resume after deleting the old one'
);
select is(
  (select revision from public.resumes where owner_id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'the new document''s own per-document revision counter correctly starts over at 1 (expected: this is a genuinely new document)'
);
reset role;
select is(
  (select lifetime_revision_count from public.resume_owner_limits where owner_id = '33333333-3333-3333-3333-333333333333'),
  4::bigint,
  'but the owner-level lifetime checkpoint counter (3 before deletion + this new insert) is NOT reset by delete/recreate -- the abuse-prevention bypass this migration exists to close'
);

-- ===== History-count cap: reject once reached, without deleting anything =====
-- User C is already at lifetime_revision_count = 4, exactly at this
-- (lowered, test-only) cap. Their current document is at revision 1.
update public.resume_limit_config set max_revisions_per_owner = 4 where id = true;
set local role authenticated;
set local request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok(
  $$update public.resumes set data = data || '{"name":"one too many"}'::jsonb where owner_id = '33333333-3333-3333-3333-333333333333' and revision = 1$$,
  'P0001', null,
  'a save that would exceed the (lowered, for this test) history-count cap is rejected with a clear error'
);
reset role;
select is(
  (select count(*)::int from public.resume_revisions where resume_id = (select id from public.resumes where owner_id = '33333333-3333-3333-3333-333333333333')),
  1,
  'the rejected save above did not write a new checkpoint for the current document (existing checkpoints are never deleted or added to on rejection)'
);
select is(
  (select lifetime_revision_count from public.resume_owner_limits where owner_id = '33333333-3333-3333-3333-333333333333'),
  4::bigint,
  'the rejected save above did not increment the owner''s lifetime checkpoint counter past the cap'
);
update public.resume_limit_config set max_revisions_per_owner = 5000 where id = true;

-- ===== Aggregate-byte cap: reject once reached, without deleting anything =====
-- User D is at revision 1 (their only successful write so far, the legacy
-- resume inserted above).
update public.resume_limit_config set max_revision_bytes_per_owner = 400 where id = true;
set local role authenticated;
set local request.jwt.claim.sub to '44444444-4444-4444-4444-444444444444';
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok(
  $$update public.resumes set data = data || jsonb_build_object('summary', repeat('x',2000)) where owner_id = '44444444-4444-4444-4444-444444444444' and revision = 1$$,
  'P0001', null,
  'a save that would exceed the (lowered, for this test) aggregate-bytes cap is rejected with a clear error'
);
reset role;
update public.resume_limit_config set max_revision_bytes_per_owner = 50000000 where id = true;

-- ===== Rate limit: reject once exhausted, then succeed after the window elapses =====
-- User D is still at revision 1 (the aggregate-byte test above was rejected).
update public.resume_limit_config set max_writes_per_window = 1, rate_window_seconds = 60 where id = true;
update public.resume_owner_limits set rate_window_started_at = now(), rate_window_count = 0 where owner_id = '44444444-4444-4444-4444-444444444444';
set local role authenticated;
set local request.jwt.claim.sub to '44444444-4444-4444-4444-444444444444';
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select lives_ok(
  $$update public.resumes set data = data || '{"name":"rate test 1"}'::jsonb where owner_id = '44444444-4444-4444-4444-444444444444' and revision = 1$$,
  'the first save within a fresh (lowered, for this test) rate window succeeds'
);
-- D is now at revision 2 after the successful save above.
select throws_ok(
  $$update public.resumes set data = data || '{"name":"rate test 2"}'::jsonb where owner_id = '44444444-4444-4444-4444-444444444444' and revision = 2$$,
  'P0001', null,
  'a second save in the same window (over the lowered per-window cap) is rejected with a clear rate-limit error'
);
reset role;
-- Simulate the window elapsing rather than actually sleeping.
update public.resume_owner_limits set rate_window_started_at = now() - interval '61 seconds' where owner_id = '44444444-4444-4444-4444-444444444444';
set local role authenticated;
set local request.jwt.claim.sub to '44444444-4444-4444-4444-444444444444';
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
-- The rejected attempt above did not change D's revision, so it is still 2.
select lives_ok(
  $$update public.resumes set data = data || '{"name":"rate test 3"}'::jsonb where owner_id = '44444444-4444-4444-4444-444444444444' and revision = 2$$,
  'a save after the rate window has elapsed succeeds again (the window resets, it does not permanently lock the account out)'
);
reset role;
update public.resume_limit_config set max_writes_per_window = 240, rate_window_seconds = 60 where id = true;

select throws_ok($$update public.resumes set data = data - 'name' where owner_id = '44444444-4444-4444-4444-444444444444'$$, '23514', null, 'missing required string rejected');
select throws_ok($$update public.resumes set data = data - 'template' where owner_id = '44444444-4444-4444-4444-444444444444'$$, '23514', null, 'missing enum rejected');
select throws_ok($$update public.resumes set data = jsonb_set(data, '{sections}', '[{"id":"s","entries":[]}]'::jsonb) where owner_id = '44444444-4444-4444-4444-444444444444'$$, '23514', null, 'missing section title rejected');
select throws_ok($$update public.resumes set data = jsonb_set(data, '{sections}', '[{"id":"s","title":"Experience","kind":null,"entries":[]}]'::jsonb) where owner_id = '44444444-4444-4444-4444-444444444444'$$, '23514', null, 'null section kind rejected');

select throws_ok($$update public.resumes set data = jsonb_set(data, '{sections}', '[{"id": "s", "title": "", "entries": []}, {"id": "s", "title": "", "entries": []}]'::jsonb) where owner_id = '44444444-4444-4444-4444-444444444444'$$, '23514', null, 'duplicate section IDs rejected');
select throws_ok($$update public.resumes set data = jsonb_set(data, '{sections}', '[{"id": "s1", "title": "", "entries": [{"id": "e", "title": "", "organization": "", "location": "", "dates": "", "description": ""}]}, {"id": "s2", "title": "", "entries": [{"id": "e", "title": "", "organization": "", "location": "", "dates": "", "description": ""}]}]'::jsonb) where owner_id = '44444444-4444-4444-4444-444444444444'$$, '23514', null, 'duplicate entry IDs across sections rejected');
select throws_ok($$update public.resumes set data = jsonb_set(data, '{sections}', '[{"id": "s", "title": "", "entries": [{"id": "s", "title": "", "organization": "", "location": "", "dates": "", "description": ""}]}]'::jsonb) where owner_id = '44444444-4444-4444-4444-444444444444'$$, '23514', null, 'entry collides with section ID rejected');
select lives_ok($$update public.resumes set data = jsonb_set(data, '{sections}', '[{"id": "節", "title": "", "entries": [{"id": "कार्य", "title": "", "organization": "", "location": "", "dates": "", "description": ""}]}, {"id": "تعليم", "title": "", "entries": []}]'::jsonb) where owner_id = '44444444-4444-4444-4444-444444444444'$$, 'unique Unicode IDs accepted');

select * from finish();
rollback;
