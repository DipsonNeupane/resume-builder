// Task 63 hosted cloud-storage acceptance check.
//
// This is intentionally narrower than scripts/check-hosted-isolation.mjs:
// it is pinned to the APWICO production Supabase origin and may only be run
// with two dedicated, empty test accounts plus an explicit project-ref
// acknowledgement. It never uses a service-role key and only deletes the
// fixture rows created by this invocation.

import { buildFixtureResume } from './check-hosted-isolation.mjs';

const PROJECT_REF = 'ggwwzwqykkncgupdimxp';
const EXPECTED_ORIGIN = `https://${PROJECT_REF}.supabase.co`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function jwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('A test-account token is not a JWT.');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

function assertExactProductionOrigin(value) {
  const url = new URL(value);
  if (
    url.origin !== EXPECTED_ORIGIN ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(`Refusing unexpected Supabase origin; expected ${EXPECTED_ORIGIN}.`);
  }
}

async function request(baseUrl, apikey, path, { method = 'GET', token, body, prefer } = {}) {
  const headers = { apikey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: response.status, ok: response.ok, json };
}

function isEmptySelection(result) {
  return result.status === 200 && Array.isArray(result.json) && result.json.length === 0;
}

async function main() {
  const baseUrl = requireEnv('TASK63_SUPABASE_URL');
  const apikey = requireEnv('TASK63_SUPABASE_PUBLISHABLE_KEY');
  const tokenA = requireEnv('TASK63_TOKEN_A');
  const tokenARecovery = requireEnv('TASK63_TOKEN_A_RECOVERY');
  const tokenB = requireEnv('TASK63_TOKEN_B');
  if (requireEnv('TASK63_PRODUCTION_CONFIRM') !== PROJECT_REF) {
    throw new Error('TASK63_PRODUCTION_CONFIRM does not match the pinned project ref.');
  }
  assertExactProductionOrigin(baseUrl);

  const payloadA = jwtPayload(tokenA);
  const payloadARecovery = jwtPayload(tokenARecovery);
  const payloadB = jwtPayload(tokenB);
  if (
    payloadA.role !== 'authenticated' ||
    payloadARecovery.role !== 'authenticated' ||
    payloadB.role !== 'authenticated'
  ) throw new Error('Only authenticated user tokens are accepted.');
  if (!payloadA.sub || payloadA.sub !== payloadARecovery.sub || !payloadB.sub || payloadA.sub === payloadB.sub) {
    throw new Error('Expected a fresh second session for account A and a distinct account B.');
  }

  const checks = [];
  const fixtureOwners = new Map();
  const record = (name, pass, status) => checks.push({ name, pass, status });
  const rest = (path, options) => request(baseUrl, apikey, `/rest/v1${path}`, options);
  const runId = crypto.randomUUID();
  const resumeA = buildFixtureResume(`${runId}-a`);
  const resumeB = buildFixtureResume(`${runId}-b`);
  resumeA.name = 'Avery Cloudtest';
  resumeB.name = 'Blair Cloudtest';

  try {
    const initialA = await rest(`/resumes?owner_id=eq.${payloadA.sub}&select=id`, { token: tokenA });
    const initialB = await rest(`/resumes?owner_id=eq.${payloadB.sub}&select=id`, { token: tokenB });
    record('dedicated-accounts-start-empty', isEmptySelection(initialA) && isEmptySelection(initialB));

    const forged = await rest('/resumes', {
      method: 'POST', token: tokenB, prefer: 'return=representation',
      body: [{ owner_id: payloadA.sub, data: resumeB }],
    });
    record('forged-owner-create-rejected', forged.status === 403 && forged.json?.code === '42501', forged.status);

    const createdA = await rest('/resumes', {
      method: 'POST', token: tokenA, prefer: 'return=representation',
      body: [{ owner_id: payloadA.sub, data: resumeA }],
    });
    const rowA = Array.isArray(createdA.json) ? createdA.json[0] : null;
    record('cloud-save', createdA.status === 201 && rowA?.revision === 1 && typeof rowA?.id === 'string', createdA.status);
    if (!rowA?.id) throw new Error('Fixture A was not created; dependent checks cannot run.');
    fixtureOwners.set(rowA.id, tokenARecovery);

    const recovered = await rest(`/resumes?id=eq.${rowA.id}&select=id,data,revision`, { token: tokenARecovery });
    record(
      'fresh-session-recovery',
      recovered.status === 200 && recovered.json?.[0]?.data?.name === resumeA.name && recovered.json?.[0]?.revision === 1,
      recovered.status,
    );

    const bReadA = await rest(`/resumes?id=eq.${rowA.id}&select=id`, { token: tokenB });
    record('other-account-cannot-read', isEmptySelection(bReadA), bReadA.status);
    const anonReadA = await rest(`/resumes?id=eq.${rowA.id}&select=id`, {});
    record('signed-out-cannot-read', anonReadA.status === 401 || anonReadA.status === 403, anonReadA.status);

    const createdB = await rest('/resumes', {
      method: 'POST', token: tokenB, prefer: 'return=representation',
      body: [{ owner_id: payloadB.sub, data: resumeB }],
    });
    const rowB = Array.isArray(createdB.json) ? createdB.json[0] : null;
    record('second-account-own-save', createdB.status === 201 && rowB?.revision === 1 && typeof rowB?.id === 'string', createdB.status);
    if (!rowB?.id) throw new Error('Fixture B was not created; account-switch checks cannot run.');
    fixtureOwners.set(rowB.id, tokenB);

    const ownAOnly = await rest('/resumes?select=id,data,revision', { token: tokenARecovery });
    const ownBOnly = await rest('/resumes?select=id,data,revision', { token: tokenB });
    record(
      'account-switch-isolation',
      ownAOnly.status === 200 && ownAOnly.json?.length === 1 && ownAOnly.json[0].id === rowA.id &&
      ownBOnly.status === 200 && ownBOnly.json?.length === 1 && ownBOnly.json[0].id === rowB.id,
    );

    const winningResume = { ...resumeA, headline: `Hosted winner ${runId}` };
    const winner = await rest(`/resumes?id=eq.${rowA.id}&revision=eq.1`, {
      method: 'PATCH', token: tokenA, prefer: 'return=representation', body: { data: winningResume },
    });
    const winnerRow = Array.isArray(winner.json) ? winner.json[0] : null;
    record('first-concurrent-save-wins', winner.status === 200 && winnerRow?.revision === 2, winner.status);

    const staleResume = { ...resumeA, headline: `Stale overwrite ${runId}` };
    const stale = await rest(`/resumes?id=eq.${rowA.id}&revision=eq.1`, {
      method: 'PATCH', token: tokenARecovery, prefer: 'return=representation', body: { data: staleResume },
    });
    const afterStale = await rest(`/resumes?id=eq.${rowA.id}&select=data,revision`, { token: tokenARecovery });
    record(
      'revision-conflict-preserves-winner',
      isEmptySelection(stale) && afterStale.json?.[0]?.revision === 2 && afterStale.json?.[0]?.data?.headline === winningResume.headline,
      stale.status,
    );

    const interruptedRevision = afterStale.json?.[0]?.revision;
    const retryResume = { ...winningResume, headline: `Recovered retry ${runId}` };
    const aborted = new AbortController();
    aborted.abort();
    let interrupted = false;
    try {
      await fetch(`${baseUrl}/rest/v1/resumes?id=eq.${rowA.id}&revision=eq.${interruptedRevision}`, {
        method: 'PATCH', signal: aborted.signal,
        headers: { apikey, Authorization: `Bearer ${tokenARecovery}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: retryResume }),
      });
    } catch (error) {
      interrupted = error?.name === 'AbortError';
    }
    const afterAbort = await rest(`/resumes?id=eq.${rowA.id}&select=data,revision`, { token: tokenARecovery });
    const retry = await rest(`/resumes?id=eq.${rowA.id}&revision=eq.${interruptedRevision}`, {
      method: 'PATCH', token: tokenARecovery, prefer: 'return=representation', body: { data: retryResume },
    });
    const retryRow = Array.isArray(retry.json) ? retry.json[0] : null;
    record(
      'interrupted-save-retry-recovery',
      interrupted && afterAbort.json?.[0]?.revision === interruptedRevision &&
      afterAbort.json?.[0]?.data?.headline === winningResume.headline && retryRow?.revision === interruptedRevision + 1,
      retry.status,
    );

    const bDeleteA = await rest(`/resumes?id=eq.${rowA.id}`, {
      method: 'DELETE', token: tokenB, prefer: 'return=representation',
    });
    record('other-account-cannot-delete', isEmptySelection(bDeleteA), bDeleteA.status);

    const currentA = await rest(`/resumes?id=eq.${rowA.id}&select=revision`, { token: tokenARecovery });
    const deleteA = await rest(`/resumes?id=eq.${rowA.id}&revision=eq.${currentA.json?.[0]?.revision}`, {
      method: 'DELETE', token: tokenARecovery, prefer: 'return=representation',
    });
    if (deleteA.json?.[0]?.id === rowA.id) fixtureOwners.delete(rowA.id);
    const goneA = await rest(`/resumes?id=eq.${rowA.id}&select=id`, { token: tokenA });
    const goneRevisions = await rest(`/resume_revisions?resume_id=eq.${rowA.id}&select=id`, { token: tokenARecovery });
    record(
      'deletion-does-not-reappear',
      deleteA.status === 200 && deleteA.json?.length === 1 && isEmptySelection(goneA) && isEmptySelection(goneRevisions),
      deleteA.status,
    );
  } finally {
    let cleanupPass = true;
    for (const [id, ownerToken] of fixtureOwners) {
      const deleted = await rest(`/resumes?id=eq.${id}`, {
        method: 'DELETE', token: ownerToken, prefer: 'return=representation',
      });
      const gone = await rest(`/resumes?id=eq.${id}&select=id`, { token: ownerToken });
      cleanupPass &&= deleted.status === 200 && deleted.json?.[0]?.id === id && isEmptySelection(gone);
    }
    record('fixture-cleanup', cleanupPass);
  }

  const passed = checks.filter((check) => check.pass).length;
  for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.status ? ` (HTTP ${check.status})` : ''}`);
  console.log(`SUMMARY ${passed}/${checks.length}`);
  if (passed !== checks.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL task63-hosted-acceptance: ${error.message}`);
  process.exitCode = 1;
});
