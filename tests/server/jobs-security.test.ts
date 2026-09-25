import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { safeJobUrl } from '../../server/jobs/url.ts'
import { techmapConfig } from '../../server/jobs/config.ts'
import { techmapSearch } from '../../server/jobs/techmap.ts'

test('safeJobUrl only accepts absolute https URLs with no embedded credentials', () => {
  assert.equal(safeJobUrl('https://careers.example/job/1'), 'https://careers.example/job/1')
  assert.equal(safeJobUrl('javascript:alert(1)'), null)
  assert.equal(safeJobUrl('data:text/html,<script>alert(1)</script>'), null)
  assert.equal(safeJobUrl('http://careers.example/job/1'), null) // not https
  assert.equal(safeJobUrl('https://user:pass@careers.example/job/1'), null) // embedded credentials
  assert.equal(safeJobUrl('/relative/path'), null)
  assert.equal(safeJobUrl(''), null)
  assert.equal(safeJobUrl(123), null)
  assert.equal(safeJobUrl('https://careers.example/' + 'a'.repeat(3000)), null) // oversized
})

test('a malformed or hostile provider record never becomes a usable View job link', () => {
  // Loaded from a static fixture (not typed inline) so the security assertion below
  // is exercised against externally-shaped, not hand-tuned, data.
  const fixturePath = fileURLToPath(new URL('./fixtures/techmap-hostile.json', import.meta.url))
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  return techmapSearch(
    { apiKey: 'fixture-key-0123456789', host: 'fixture.example', url: 'https://fixture.example/search' },
    { title: 'engineer' },
    async () => Response.json(fixture),
    new Date('2026-09-24T00:00:00Z'),
  ).then(result => {
    assert.equal(result.jobs.length, 0)
  })
})

test('the configured TECHMAP_API_KEY sentinel never appears in a thrown error message', async () => {
  const sentinel = 'sk-super-secret-techmap-key-0123456789'
  const config = techmapConfig({ TECHMAP_API_KEY: sentinel })
  assert.equal(config.apiKey, sentinel)
  await assert.rejects(
    techmapSearch(config, { title: 'engineer' }, async () => new Response('', { status: 500 })),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(!error.message.includes(sentinel))
      return true
    },
  )
})

test('an unreachable provider (network failure) fails closed without ever falling back to a real network call', async () => {
  const fetcher = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
  await assert.rejects(
    techmapSearch({ apiKey: 'fixture-key-0123456789', host: 'fixture.example', url: 'https://fixture.example/search' }, { title: 'engineer' }, fetcher),
    { status: 503 },
  )
})

test('techmapConfig rejects a missing or too-short key even though the endpoint is fixed', () => {
  assert.throws(() => techmapConfig({}), { status: 503 })
  assert.throws(() => techmapConfig({ TECHMAP_API_KEY: 'short' }), { status: 503 })
})
