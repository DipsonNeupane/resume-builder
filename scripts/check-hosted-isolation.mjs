// ResumeStride: hosted Supabase Auth/PostgREST two-account acceptance harness.
//
// Verifies, against a REAL hosted Supabase project, the same owner-isolation
// contract the local pgTAP suite (supabase/tests/resumes_rls.test.sql) already
// proves against an in-process Postgres: that RLS + grants on public.resumes /
// public.resume_revisions actually hold when accessed the way the deployed app
// really accesses them — through PostgREST with a real user access token, not
// a simulated auth.uid(). It does NOT replace that suite; it is the one thing
// the suite cannot do (exercise a real hosted Auth/PostgREST round trip).
//
// Inputs are read ONLY from environment variables, and are all things the
// caller must already hold before running this script — this script never
// creates a user, never reads a secret from disk/config, and never accepts or
// uses a service-role/admin key:
//   HOSTED_ISOLATION_SUPABASE_URL       e.g. https://ntrqseoiwyrvdsobwxaj.supabase.co
//   HOSTED_ISOLATION_SUPABASE_ANON_KEY  the project's public/publishable key
//   HOSTED_ISOLATION_USER_A_TOKEN       an already-issued access token for account A
//   HOSTED_ISOLATION_USER_B_TOKEN       an already-issued access token for account B
//
// Safety guard: HOSTED_ISOLATION_SUPABASE_URL must be the recovery project's
// exact HTTPS origin (see DEFAULT_ALLOWED_PROJECT_REF below) — no embedded
// credentials, no non-default port, no path/query/fragment tacked on. Any
// other project — most importantly a production project — is refused before
// any network call is made, in both the CLI entrypoint (main()) and the
// exported runIsolationChecks() itself, so a caller that invokes the
// exported function directly gets the same protection as the CLI. This
// exists specifically so a wrong/stale env var can never point this script
// at production by mistake.
//
// See docs/HOSTED_ISOLATION_CHECK.md for what each check proves, exact
// cleanup behavior, and how to run this script.

import { fileURLToPath } from 'node:url';

export const DEFAULT_ALLOWED_PROJECT_REF = 'ntrqseoiwyrvdsobwxaj';

export function assertProjectRef(supabaseUrl, allowedRef = DEFAULT_ALLOWED_PROJECT_REF) {
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error('HOSTED_ISOLATION_SUPABASE_URL is not a valid URL.');
  }
  const expectedOrigin = `https://${allowedRef}.supabase.co`;
  const isExactOrigin =
    url.origin === expectedOrigin &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '';
  if (!isExactOrigin) {
    throw new Error(
      `Refusing to run: this harness only accepts the recovery project's exact HTTPS origin, with no ` +
        `credentials, non-default port, path, query, or fragment (expected ${expectedOrigin}, got ${supabaseUrl}). ` +
        'This guard exists to prevent an accidental run against production.'
    );
  }
  return url.hostname;
}

// Decodes the middle segment of a JWT (no signature verification — this
// script never holds a key to verify with) to read its `role` claim, so
// runIsolationChecks() can refuse a service-role/admin token before ever
// using it. Returns null for anything that isn't a 3-part JWT (e.g. a
// non-JWT publishable key), which is fine for HOSTED_ISOLATION_SUPABASE_ANON_KEY
// but never acceptable for the two user tokens.
function jwtRole(token) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

// Mirrors src/model.ts's Resume type and the resume_data_is_valid SQL
// constraint (supabase/migrations/20260919150000_resume_storage_bounds.sql).
// Deliberately self-contained rather than importing src/model.ts: this is a
// plain Node script run outside the Vite/TS build, matching the existing
// scripts/test-database.mjs convention of not importing app source. If the
// schema changes, update both places, same as that migration's own SQL copy
// of isResume() already must be kept in sync by hand.
export function buildFixtureResume(runId) {
  return {
    version: 1,
    name: 'Fixture Testperson',
    headline: `Hosted isolation fixture ${runId}`,
    email: 'fixture@example.invalid',
    phone: '+1 555 0100',
    location: 'Example City, Exampleland',
    website: 'https://example.invalid/fixture',
    summary: 'Fictional fixture resume used only by scripts/check-hosted-isolation.mjs.',
    skills: 'Fixture data only',
    profileHeading: 'Profile',
    skillsHeading: 'Skills',
    sections: [
      {
        id: `fixture-section-experience-${runId}`,
        title: 'Experience',
        kind: 'experience',
        entries: [
          {
            id: `fixture-entry-${runId}`,
            title: 'Fixture Role',
            organization: 'Fixture Org',
            location: 'Example City',
            dates: '2020 — 2021',
            description: 'Fictional entry for isolation acceptance testing only.',
          },
        ],
      },
    ],
    template: 'modern',
    paper: 'A4',
    accent: '#20594a',
    direction: 'ltr',
    language: 'en',
    noExperience: false,
  };
}

async function call(fetchImpl, baseUrl, path, { method = 'GET', token, apikey, body, prefer } = {}) {
  const headers = { apikey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = typeof res.text === 'function' ? await res.text() : '';
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const ok = typeof res.ok === 'boolean' ? res.ok : res.status >= 200 && res.status < 300;
  return { status: res.status, ok, json };
}

async function getUserId(fetchImpl, baseUrl, apikey, token) {
  const res = await call(fetchImpl, baseUrl, '/auth/v1/user', { method: 'GET', token, apikey });
  if (!res.ok || !res.json || typeof res.json.id !== 'string') {
    throw new Error('Could not resolve a user id from an access token via /auth/v1/user; check the token is valid and unexpired.');
  }
  return res.json.id;
}

const SKIPPED_AFTER_SETUP_FAILURE = [
  'owner-reads-own',
  'owner-update-bumps-revision',
  'owner-checkpoint-recorded',
  'other-account-cannot-read',
  'other-account-cannot-update',
  'update-attempt-did-not-mutate-row',
  'other-account-cannot-delete',
  'delete-attempt-did-not-remove-row',
  'anon-cannot-read',
  'invalid-shape-rejected',
  'invalid-shape-attempt-did-not-mutate-row',
];

// A row genuinely denied by RLS comes back as HTTP 200 with an empty JSON
// array (PostgREST filters/matches zero rows; it is not an error). A 5xx, a
// non-2xx, or an unparseable body must NEVER be treated as "denied" — that
// would silently mark a broken/erroring backend as a passing isolation
// check. Both the status AND the parsed array shape are required here.
function isDeniedEmptySelection(res) {
  return res.status === 200 && Array.isArray(res.json) && res.json.length === 0;
}

// A row genuinely rejected by a Postgres constraint/policy comes back as a
// specific HTTP status with a specific Postgres error code in the body — not
// merely "not ok" (which a 500 or a network hiccup would also satisfy).
function isRejectedWithCode(res, expectedStatus, expectedCode) {
  return res.status === expectedStatus && !!res.json && res.json.code === expectedCode;
}

// Runs every acceptance check in a fixed, deterministic sequence of HTTP
// calls (documented in docs/HOSTED_ISOLATION_CHECK.md) so this function's
// behavior can be exercised with a deterministic mocked fetchImpl in tests,
// with no real network access. Always attempts cleanup of anything this run
// itself created, even when an earlier check fails or throws, and the final
// `ok` reflects the cleanup outcome too (computed after cleanup finishes,
// not before).
export async function runIsolationChecks({ fetchImpl, supabaseUrl, apikey, tokenA, tokenB }) {
  // Enforced here too (not only in main()) so any caller of the exported
  // function gets the same production-safety guarantee before a single
  // network call is made.
  assertProjectRef(supabaseUrl);

  const checks = [];
  const push = (name, pass, extra = {}) => checks.push({ name, pass, ...extra });
  const runId = crypto.randomUUID();
  const rest = (path, opts) => call(fetchImpl, supabaseUrl, `/rest/v1${path}`, { apikey, ...opts });

  const roleA = jwtRole(tokenA);
  const roleB = jwtRole(tokenB);
  const tokensOk = roleA === 'authenticated' && roleB === 'authenticated';
  push('tokens-are-authenticated-role', tokensOk, tokensOk
    ? {}
    : {
        note:
          'HOSTED_ISOLATION_USER_A_TOKEN and HOSTED_ISOLATION_USER_B_TOKEN must both be user access tokens ' +
          `with role "authenticated" (got A="${roleA ?? 'unparseable'}", B="${roleB ?? 'unparseable'}"). ` +
          'Service-role/admin keys and non-JWT API keys are never accepted.',
      });
  if (!tokensOk) return { ok: false, checks, runId };

  const apikeyRole = jwtRole(apikey);
  if (apikeyRole === 'service_role') {
    push('apikey-is-not-privileged', false, {
      note: 'HOSTED_ISOLATION_SUPABASE_ANON_KEY must be the project\'s public anon/publishable key, never a service-role key.',
    });
    return { ok: false, checks, runId };
  }

  let aId, bId;
  try {
    aId = await getUserId(fetchImpl, supabaseUrl, apikey, tokenA);
    bId = await getUserId(fetchImpl, supabaseUrl, apikey, tokenB);
  } catch (err) {
    push('resolve-test-account-identities', false, { note: err.message });
    return { ok: false, checks, runId };
  }

  if (aId === bId) {
    push('distinct-test-accounts', false, {
      note: 'HOSTED_ISOLATION_USER_A_TOKEN and HOSTED_ISOLATION_USER_B_TOKEN resolve to the same account; two distinct accounts are required.',
    });
    return { ok: false, checks, runId };
  }
  push('distinct-test-accounts', true);

  const cleanupIds = new Set();

  try {
    // Forged-owner insert MUST be rejected before any legitimate row exists
    // for A, so a broken WITH CHECK policy can't hide behind the
    // resumes_owner_unique constraint instead of actually being exercised.
    // A genuine RLS WITH CHECK rejection is HTTP 403 with Postgres error
    // code 42501 (insufficient_privilege) — not merely "no rows came back",
    // which a 500 or a dropped connection would also produce.
    const forged = await rest('/resumes', {
      method: 'POST',
      token: tokenB,
      prefer: 'return=representation',
      body: [{ owner_id: aId, data: buildFixtureResume(`${runId}-forged`) }],
    });
    const forgedRows = Array.isArray(forged.json) ? forged.json : [];
    if (forgedRows.length > 0) for (const row of forgedRows) if (row?.id) cleanupIds.add(row.id);
    push('forged-owner-insert-rejected', isRejectedWithCode(forged, 403, '42501'), { status: forged.status, code: forged.json?.code });

    const created = await rest('/resumes', {
      method: 'POST',
      token: tokenA,
      prefer: 'return=representation',
      body: [{ owner_id: aId, data: buildFixtureResume(runId) }],
    });
    const createdRows = Array.isArray(created.json) ? created.json : [];
    const createdOk =
      created.status === 201 && createdRows.length === 1 && createdRows[0].revision === 1 && typeof createdRows[0].id === 'string';
    push('owner-creates-own', createdOk, { status: created.status });

    if (!createdOk) {
      for (const name of SKIPPED_AFTER_SETUP_FAILURE) push(name, false, { note: 'skipped: fixture resume was not created' });
    } else {
      const resumeId = createdRows[0].id;
      cleanupIds.add(resumeId);

      const readOwn = await rest(`/resumes?id=eq.${resumeId}&select=id,revision`, { token: tokenA });
      const readOwnRows = Array.isArray(readOwn.json) ? readOwn.json : [];
      push('owner-reads-own', readOwn.status === 200 && readOwnRows.length === 1 && readOwnRows[0].id === resumeId, {
        status: readOwn.status,
      });

      const updated = await rest(`/resumes?id=eq.${resumeId}`, {
        method: 'PATCH',
        token: tokenA,
        prefer: 'return=representation',
        body: { data: { ...buildFixtureResume(runId), headline: `Hosted isolation fixture ${runId} (updated)` } },
      });
      const updatedRows = Array.isArray(updated.json) ? updated.json : [];
      push('owner-update-bumps-revision', updated.status === 200 && updatedRows.length === 1 && updatedRows[0].revision === 2, {
        status: updated.status,
      });

      const revisions = await rest(`/resume_revisions?resume_id=eq.${resumeId}&select=revision&order=revision.asc`, { token: tokenA });
      const revisionNumbers = Array.isArray(revisions.json) ? revisions.json.map((r) => r.revision) : [];
      push(
        'owner-checkpoint-recorded',
        revisions.status === 200 && revisionNumbers.length === 2 && revisionNumbers[0] === 1 && revisionNumbers[1] === 2,
        { status: revisions.status }
      );

      // From here, "the other account cannot X" checks require an actual
      // HTTP 200 with an empty array (RLS silently filtering the row out of
      // B's view/update/delete) — never inferred from a failed/unparseable
      // response, which would falsely read as "denied".
      const bRead = await rest(`/resumes?id=eq.${resumeId}`, { token: tokenB });
      push('other-account-cannot-read', isDeniedEmptySelection(bRead), { status: bRead.status });

      const bUpdate = await rest(`/resumes?id=eq.${resumeId}`, {
        method: 'PATCH',
        token: tokenB,
        prefer: 'return=representation',
        body: { data: { ...buildFixtureResume(runId), headline: 'forged by B' } },
      });
      push('other-account-cannot-update', isDeniedEmptySelection(bUpdate), { status: bUpdate.status });

      const afterBUpdate = await rest(`/resumes?id=eq.${resumeId}&select=id,revision`, { token: tokenA });
      const afterBUpdateRows = Array.isArray(afterBUpdate.json) ? afterBUpdate.json : [];
      push('update-attempt-did-not-mutate-row', afterBUpdate.status === 200 && afterBUpdateRows[0]?.revision === 2, {
        status: afterBUpdate.status,
      });

      const bDelete = await rest(`/resumes?id=eq.${resumeId}`, { method: 'DELETE', token: tokenB, prefer: 'return=representation' });
      push('other-account-cannot-delete', isDeniedEmptySelection(bDelete), { status: bDelete.status });

      const afterBDelete = await rest(`/resumes?id=eq.${resumeId}&select=id`, { token: tokenA });
      const afterBDeleteRows = Array.isArray(afterBDelete.json) ? afterBDelete.json : [];
      push('delete-attempt-did-not-remove-row', afterBDelete.status === 200 && afterBDeleteRows.length === 1, {
        status: afterBDelete.status,
      });

      // Anonymous access is tested by sending NO Authorization header at
      // all (only the apikey header, already attached by `rest()`) — never
      // by putting the anon/publishable key itself in the Bearer header.
      // Newer publishable keys are not JWTs, so doing that would just fail
      // auth for the wrong reason instead of exercising anonymous RLS.
      const anonRead = await rest(`/resumes?id=eq.${resumeId}`, {});
      push('anon-cannot-read', isDeniedEmptySelection(anonRead) ||
        ([401, 403].includes(anonRead.status) && anonRead.json?.code === '42501'),
        { status: anonRead.status });

      // A genuine CHECK-constraint rejection is HTTP 400 with Postgres
      // error code 23514 (check_violation) — not merely "not ok".
      const invalidShape = await rest(`/resumes?id=eq.${resumeId}`, {
        method: 'PATCH',
        token: tokenA,
        prefer: 'return=representation',
        body: { data: { ...buildFixtureResume(runId), template: 'not-a-real-template' } },
      });
      push('invalid-shape-rejected', isRejectedWithCode(invalidShape, 400, '23514'), {
        status: invalidShape.status,
        code: invalidShape.json?.code,
      });

      const afterInvalidShape = await rest(`/resumes?id=eq.${resumeId}&select=id,revision`, { token: tokenA });
      const afterInvalidShapeRows = Array.isArray(afterInvalidShape.json) ? afterInvalidShape.json : [];
      push('invalid-shape-attempt-did-not-mutate-row', afterInvalidShape.status === 200 && afterInvalidShapeRows[0]?.revision === 2, {
        status: afterInvalidShape.status,
      });
    }
  } catch (err) {
    push('unexpected-error', false, { note: err.message });
  } finally {
    // Cleanup runs even if a check above threw, and deletes ONLY the id(s)
    // this run itself created (the legitimate fixture, plus any row a broken
    // forged-owner insert may have created) — never a broader owner-scoped
    // delete. resume_revisions rows cascade-delete with their parent resume
    // (on delete cascade, supabase/migrations/20260918120000_resume_storage.sql).
    // resume_owner_limits counters for account A are NOT reset by this: the
    // app's own design deliberately retains those counters across a
    // delete/recreate of a resume (docs/CLOUD_LIMITS_REVIEW.md), so a nonzero
    // lifetime counter left behind on account A after this run is expected,
    // not a fixture-cleanup gap. Passing requires not just HTTP 200 but the
    // response's own returned ids to exactly match what was meant to be
    // removed — a 200 with a partial/empty result set is a cleanup failure.
    if (cleanupIds.size > 0) {
      const idList = [...cleanupIds].join(',');
      const cleanup = await rest(`/resumes?id=in.(${idList})`, { method: 'DELETE', token: tokenA, prefer: 'return=representation' });
      const cleanupRows = Array.isArray(cleanup.json) ? cleanup.json : [];
      const removedIds = new Set(cleanupRows.map((row) => row?.id).filter(Boolean));
      const cleanupOk = cleanup.status === 200 && removedIds.size === cleanupIds.size && [...cleanupIds].every((id) => removedIds.has(id));
      push('cleanup-fixture-removed', cleanupOk, { status: cleanup.status, removed: removedIds.size, expected: cleanupIds.size });
    }
  }

  // Computed only now, after cleanup has actually run, so a cleanup failure
  // (or an unexpected thrown error above) always flips the overall result —
  // this used to be computed from an early `return` inside the try block,
  // before the finally block's cleanup check was even pushed.
  return { ok: checks.every((c) => c.pass), checks, runId };
}

function redactedProjectHost(supabaseUrl) {
  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return '(invalid URL)';
  }
}

async function main() {
  const supabaseUrl = process.env.HOSTED_ISOLATION_SUPABASE_URL;
  const apikey = process.env.HOSTED_ISOLATION_SUPABASE_ANON_KEY;
  const tokenA = process.env.HOSTED_ISOLATION_USER_A_TOKEN;
  const tokenB = process.env.HOSTED_ISOLATION_USER_B_TOKEN;

  const missing = [];
  if (!supabaseUrl) missing.push('HOSTED_ISOLATION_SUPABASE_URL');
  if (!apikey) missing.push('HOSTED_ISOLATION_SUPABASE_ANON_KEY');
  if (!tokenA) missing.push('HOSTED_ISOLATION_USER_A_TOKEN');
  if (!tokenB) missing.push('HOSTED_ISOLATION_USER_B_TOKEN');
  if (missing.length > 0) {
    console.error(`Missing required env var(s): ${missing.join(', ')}. See docs/HOSTED_ISOLATION_CHECK.md.`);
    process.exitCode = 1;
    return;
  }

  try {
    assertProjectRef(supabaseUrl);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Hosted isolation check: project host ${redactedProjectHost(supabaseUrl)} matches the allowed recovery project. Running checks (tokens and fixture content are never printed)...`);
  const result = await runIsolationChecks({ fetchImpl: fetch, supabaseUrl, apikey, tokenA, tokenB });
  for (const check of result.checks) {
    const statusPart = check.status !== undefined ? ` (status ${check.status})` : '';
    const notePart = check.note ? ` — ${check.note}` : '';
    console.log(`[${check.pass ? 'PASS' : 'FAIL'}] ${check.name}${statusPart}${notePart}`);
  }
  console.log(result.ok ? 'All checks passed.' : 'One or more checks FAILED — see above. Do not treat isolation as verified.');
  process.exitCode = result.ok ? 0 : 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
