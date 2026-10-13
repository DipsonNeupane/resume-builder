/// <reference path="../../apps/extension/src/types/chrome-minimal.d.ts" />
import test from 'node:test'
import assert from 'node:assert/strict'

type Listener = (message: unknown, sender: {id?: string;url?: string}, respond: (value: {received: boolean}) => void) => boolean
let listener: Listener
const state: Record<string, unknown> = {}
let tabCount = 0
let injections = 0
let success = true
Reflect.set(globalThis, 'chrome', {
  runtime: { id: 'extension-fixture', getURL: (path: string) => `chrome-extension://extension-fixture/${path}`, onMessage: { addListener: (value: Listener) => { listener = value } } },
  alarms: { create: async () => {}, onAlarm: { addListener: () => {} } },
  storage: { session: {
    get: async () => structuredClone(state),
    set: async (value: Record<string, unknown>) => { Object.assign(state, structuredClone(value)) },
    remove: async (key: string) => { delete state[key] },
  } },
  tabs: { create: async () => { tabCount++; return { id: 123 } }, get: async () => ({ id: 123, url: 'https://apwico.com/', status: 'complete' }) },
  scripting: { executeScript: async () => { injections++; return [{ frameId: 0, result: success }] } },
})
await import('../../apps/extension/src/background/worker.ts')
const { readPending, clearPending } = await import('../../apps/extension/src/lib/pending.ts')
const capture = { title: 'Role', company: 'Company', description: 'Duties', sourceUrl: 'https://jobs.example/one', capturedAt: new Date().toISOString() }
const sender = { id: 'extension-fixture', url: 'chrome-extension://extension-fixture/popup.html' }
const message = { type: 'resumestride:send-reviewed-job', capture, appUrl: 'https://apwico.com/' }
const send = (data: unknown) => new Promise<{received: boolean}>(resolve => listener(data, sender, resolve))

test('worker rejects foreign senders, non-popup paths, unsafe destinations and malformed captures before opening a tab', async () => {
  for (const badSender of [{ ...sender, id: 'other' }, { ...sender, url: sender.url + '?bad' }, { ...sender, url: 'https://apwico.com/' }]) {
    assert.equal(listener(message, badSender, () => assert.fail('must not respond to foreign sender')), false)
  }
  for (const appUrl of ['https://evil.test/','https://apwico.com.evil.test/','https://user@resumestride.com/','https://apwico.com/path','https://apwico.com/?secret=1','http://127.0.0.1:9999/']) assert.deepEqual(await send({ ...message, appUrl }), { received: false })
  for (const change of [{ description: 'x'.repeat(12001) }, { authToken: 'secret' }, { sourceUrl: 'javascript:alert(1)' }, { originalSourceUrl: 'https://jobs.example/?secret=1' }]) assert.deepEqual(await send({ ...message, capture: { ...capture, ...change } }), { received: false })
  assert.equal(tabCount, 0)
  assert.deepEqual(state, {})
})

test('worker has exactly three failed attempts and retains only one bounded session capture for explicit retry', async () => {
  success = false; injections = 0
  assert.deepEqual(await send(message), { received: false })
  assert.equal(injections, 3)
  assert.deepEqual(await readPending(), {capture,descriptionComplete:true,warnings:[]})
  assert.deepEqual(Object.keys(state), ['pendingCapture'])
  success = true; injections = 0
  assert.deepEqual(await send(message), { received: true })
  assert.equal(injections, 1)
  assert.equal(await readPending(), null)
})

test('expired session data is deleted rather than restored or automatically resent', async () => {
  const initialTabs = tabCount
  state.pendingCapture = { payload: capture, expiresAt: Date.now() - 1 }
  assert.equal(await readPending(), null)
  assert.deepEqual(state, {})
  assert.equal(tabCount, initialTabs)
})

test('pending review preserves incomplete-description warnings across worker restarts', async () => {
  state.pendingCapture = { payload: capture, descriptionComplete: false, warnings: ['Selected text may be incomplete.'], expiresAt: Date.now() + 1000 }
  assert.deepEqual(await readPending(), { capture, descriptionComplete: false, warnings: ['Selected text may be incomplete.'] })
  await clearPending()
})


test('successful receipt clears equivalent reordered storage but leaves a newer review intact', async () => {
  state.pendingCapture = { payload: Object.fromEntries(Object.entries(capture).reverse()), expiresAt: Date.now() + 1000 };
  await clearPending(capture);
  assert.equal(await readPending(), null);
  state.pendingCapture = { payload: { ...capture, description: 'New edit' }, expiresAt: Date.now() + 1000 };
  await clearPending(capture);
  assert.equal((await readPending())?.capture.description, 'New edit');
  await clearPending();
});
