/// <reference path="../../apps/extension/src/types/chrome-minimal.d.ts" />
import test from 'node:test'
import assert from 'node:assert/strict'

type Response = { status: string; message?: string; tabId?: number }
type Listener = (message: unknown, sender: {id?: string;url?: string}, respond: (value: Response) => void) => boolean
let listener: Listener
let tabCount = 0
let injections = 0
let injectionResult: { status: string; message?: string } | null = { status: 'saved' }
Reflect.set(globalThis, 'chrome', {
  runtime: { id: 'extension-fixture', getURL: (path: string) => `chrome-extension://extension-fixture/${path}`, onMessage: { addListener: (value: Listener) => { listener = value } } },
  tabs: { create: async () => { tabCount++; return { id: 123 } } },
  scripting: { executeScript: async () => { injections++; return [{ frameId: 0, result: injectionResult }] } },
})
await import('../../apps/extension/src/background/worker.ts')
const capture = { title: '', company: '', description: '', site: 'linkedin', sourceUrl: 'https://www.linkedin.com/jobs/view/123', capturedAt: new Date().toISOString() }
const sender = { id: 'extension-fixture', url: 'chrome-extension://extension-fixture/popup.html' }
const message = { type: 'resumestride:save-job', capture, appUrl: 'https://apwico.com/' }
const send = (data: unknown) => new Promise<Response>(resolve => listener(data, sender, resolve))

test('worker rejects foreign senders, unsafe destinations, private URLs and malformed captures before opening a tab', async () => {
  for (const badSender of [{ ...sender, id: 'other' }, { ...sender, url: sender.url + '?bad' }, { ...sender, url: 'https://apwico.com/' }]) {
    assert.equal(listener(message, badSender, () => assert.fail('must not respond to foreign sender')), false)
  }
  for (const appUrl of ['https://evil.test/','https://apwico.com.evil.test/','https://user@apwico.com/','https://apwico.com/path','https://apwico.com/?secret=1','http://127.0.0.1:9999/']) assert.equal((await send({ ...message, appUrl })).status, 'error')
  for (const change of [{ title: 42 }, { authToken: 'secret' }, { sourceUrl: 'https://127.0.0.1/job' }, { sourceUrl: 'javascript:alert(1)' }]) assert.equal((await send({ ...message, capture: { ...capture, ...change } })).status, 'error')
  assert.equal(tabCount, 0)
})

test('worker has exactly three bounded attempts and returns a short recovery error', async () => {
  injectionResult = null; injections = 0
  const failed = await send(message)
  assert.deepEqual(failed, { status: 'error', message: undefined, tabId: 123 })
  assert.equal(injections, 3)
  injectionResult = { status: 'saved' }; injections = 0
  assert.deepEqual(await send(message), { status: 'saved', message: undefined, tabId: 123 })
  assert.equal(injections, 1)
})

test('worker relays signed-out and duplicate states without tokens or account data', async () => {
  for (const status of ['signed_out', 'already_saved'] as const) {
    injectionResult = { status }
    const result = await send(message)
    assert.deepEqual(result, { status, message: undefined, tabId: 123 })
    assert.doesNotMatch(JSON.stringify(result), /token|owner|email/i)
  }
})
