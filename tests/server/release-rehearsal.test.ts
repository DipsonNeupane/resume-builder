import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { legacyProductionOrigins, productionOrigin, requestSeo } from '../../middleware.ts'
import { interfaceLocaleStorageKey } from '../../src/i18n/locale.ts'
import { rescueKey, storageKey } from '../../src/model.ts'

const read = (path: string) => readFileSync(path, 'utf8')

test('dual-domain cutover stays disabled by default and maps old URLs in one hop', () => {
  assert.equal(productionOrigin, 'https://apwico.com')
  assert.deepEqual(legacyProductionOrigins, ['https://resumestride.com', 'https://www.resumestride.com'])
  assert.match(read('.env.example'), /^BRAND_DOMAIN_REDIRECTS_ENABLED=false$/m)
  assert.match(read('.env.example'), /^BRAND_PERMANENT_REDIRECTS_ENABLED=false$/m)

  for (const origin of [...legacyProductionOrigins, 'https://www.apwico.com']) {
    const source = new URL('/resources/resume-keywords/?utm_source=legacy&utm_campaign=cutover', origin)
    const disabled = requestSeo(source, true, false)
    assert.equal(disabled.status, 0)
    assert.equal(disabled.headers['X-Robots-Tag'], 'noindex, nofollow, noarchive')

    const staged = requestSeo(source, true, true)
    assert.equal(staged.status, 307)
    assert.equal(staged.headers['Cache-Control'], 'private, no-store')
    const enabled = requestSeo(source, true, true, true)
    assert.equal(enabled.status, 301)
    assert.equal(enabled.headers.Location, 'https://apwico.com/resources/resume-keywords/?utm_source=legacy&utm_campaign=cutover')
  }

  const canonical = requestSeo(new URL('https://apwico.com/resources/resume-keywords/'), true, true, true)
  assert.equal(canonical.status, 0, 'the canonical host must never redirect to itself')
  const oldApi = new URL('https://resumestride.com/api/jobs-account')
  assert.equal(requestSeo(oldApi, true, true, true, 'POST').status, 0, 'old-tab API writes must never be redirected')
  assert.equal(requestSeo(oldApi, true, true, true, 'GET').status, 0, 'API reads must never be redirected')
})

test('private/deep routes remain noindex and retain no content in their URLs', () => {
  for (const path of [
    '/workspace/resume',
    '/workspace/jobs/saved',
    '/workspace/account',
    '/workspace/pro',
    '/workspace/jobs/11111111-1111-4111-8111-111111111111/match',
    '/workspace/resumes/22222222-2222-4222-8222-222222222222',
  ]) {
    const policy = requestSeo(new URL(path, productionOrigin), true, false)
    assert.equal(policy.status, 0)
    assert.equal(policy.headers['X-Robots-Tag'], 'noindex, nofollow, noarchive')
    assert.equal(policy.headers['Cache-Control'], 'private, no-store')
    assert.ok(!/[?&](?:resume|job|description|email|token)=/i.test(path))
  }
})

test('the APWICO release preserves durable client and provider identifiers', () => {
  assert.equal(storageKey, 'resumestride.resume.v1')
  assert.equal(rescueKey, 'resumestride.resume.v1.rescue')
  assert.equal(interfaceLocaleStorageKey, 'resumestride.interface-locale.v1')
  assert.match(read('src/main.tsx'), /resumestride\.jobDraft/)
  assert.match(read('src/routing/continuation.ts'), /resumestride\.navigationContinuation\.v1/)
  assert.match(read('src/services/analytics.ts'), /resumestride\.analytics\.firstTouch/)
  assert.match(read('server/billing/offer-handlers.ts'), /resumestride_owner/)
  assert.match(read('scripts/provision-stripe-catalog.ts'), /resumestride_catalog/)
})

test('the legacy origin has an explicit browser-only work transition notice', () => {
  const app = read('src/main.tsx')
  assert.match(app, /window\.location\.hostname==='resumestride\.com'/)
  assert.match(app, /Browser-only work on this address cannot transfer automatically/)
  assert.match(app, /Review this browser draft/)
  assert.match(app, /Open account/)
})

test('the staged database migration corrects public support copy without renaming state', () => {
  const migration = read('supabase/migrations/20261001090000_apwico_support_identity.sql')
  assert.match(migration, /pg_get_functiondef\('public\.resumes_enforce_owner_limits\(\)'::regprocedure\)/)
  assert.match(migration, /replace\(definition, 'support@resumestride\.com', 'support@apwico\.com'\)/)
  assert.doesNotMatch(migration, /\b(?:drop table|delete from|truncate|alter table)\b/i)
})

test('the release runbook contains one provider checklist with verification and rollback', () => {
  const runbook = read('docs/redesign/APWICO_PRODUCTION_CUTOVER_RUNBOOK.md')
  for (const provider of ['Domain / DNS', 'Hosting', 'Supabase / Auth', 'Transactional email', 'Stripe', 'Search Console', 'Analytics']) {
    assert.match(runbook, new RegExp(`\\| ${provider.replace('/', '\\/')} \\|`))
  }
  for (const required of ['Expected value', 'Immediate verification', 'Rollback', 'Agent after authorization', 'Owner login / approval', 'Optional / post-launch']) {
    assert.ok(runbook.includes(required), `runbook is missing ${required}`)
  }
  assert.match(runbook, /BRAND_DOMAIN_REDIRECTS_ENABLED=false/)
  assert.match(runbook, /Do not put secrets/i)
})
