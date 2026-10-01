import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { interfaceLocaleStorageKey } from '../../src/i18n/locale.ts'
import { rescueKey, storageKey } from '../../src/model.ts'

const read = (path: string) => readFileSync(path, 'utf8')

test('persistent browser and protocol identifiers remain compatible across the APWICO migration', () => {
 assert.equal(storageKey, 'resumestride.resume.v1')
 assert.equal(rescueKey, 'resumestride.resume.v1.rescue')
 assert.equal(interfaceLocaleStorageKey, 'resumestride.interface-locale.v1')
 assert.match(read('src/main.tsx'), /const jobDraftStorageKey = 'resumestride\.jobDraft'/)
 assert.match(read('src/routing/continuation.ts'), /'resumestride\.navigationContinuation\.v1'/)
 assert.match(read('src/features/onboarding/jobFirstState.ts'), /'resumestride\.pendingJobFirst\.v1'/)
 assert.match(read('src/services/analytics.ts'), /'resumestride\.analytics\.firstTouch'/)
 assert.match(read('apps/extension/src/lib/config.ts'), /'resumestride:job-import'/)
})

test('provider-facing legacy identifiers are retained instead of orphaning live references', () => {
 assert.match(read('server/billing/offer-handlers.ts'), /resumestride_owner/)
 assert.match(read('scripts/provision-stripe-catalog.ts'), /resumestride_catalog/)
 assert.match(read('scripts/provision-stripe-catalog.ts'), /lookup_key:`resumestride_/)
})

test('APWICO is the public default while compatibility is explicit and bounded', () => {
 assert.match(read('package.json'), /"name": "apwico"/)
 assert.match(read('.env.example'), /APP_ORIGIN=https:\/\/apwico\.com/)
 assert.match(read('.env.example'), /BRAND_DOMAIN_REDIRECTS_ENABLED=false/)
 assert.match(read('middleware.ts'), /productionOrigin = 'https:\/\/apwico\.com'/)
 assert.match(read('src/brand.ts'), /supportEmail = 'support@apwico\.com'/)
})
