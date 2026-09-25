import {test,expect,chromium} from '@playwright/test';
import {resolve} from 'node:path';
import type {ExtractResult} from '../../apps/extension/src/lib/types';

for (const closePopup of [false,true]) test(`unpacked extension delivers reviewed text${closePopup ? ' after popup closes' : ' through real Chrome APIs'}`,async()=>{
 const extensionPath=resolve('apps/extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
 try {
  const manager=await context.newPage();await manager.goto('chrome://extensions/');
  const item=manager.locator('extensions-item').filter({hasText:'ResumeStride Job Capture'});
  await expect(item).toHaveCount(1);
  const id=await item.getAttribute('id');expect(id).toBeTruthy();
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  const fixture=await context.newPage();
  await fixture.goto('http://127.0.0.1:5185/extension-fixture/job-posting.html');
  const extraction=await popup.evaluate<ExtractResult>(`(async () => {
   const tabs=await chrome.tabs.query({});
   const tab=tabs.find(tab=>tab.url?.includes('/extension-fixture/job-posting.html'));
   const [injection]=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['dist/inject/extract-job.js']});
   return injection.result;
  })()`);
  expect(extraction.supported).toBe(true);
  if(!extraction.supported) throw new Error(extraction.reason);
  expect(extraction.capture.title).toBe('Senior Widget Engineer');
  expect(extraction.capture.company).toBe('Acme Corp');
  await popup.getByLabel('Job title' ,{exact:true}).fill('Extension smoke role');
  await popup.getByLabel('Job description',{exact:true}).fill('Support customers and document solutions.');
  await popup.locator('#app').screenshot({path:'/tmp/rs-premium-extension-review.png'});
  await popup.getByText('Source & connection', {exact:true}).click();
  await popup.getByLabel('ResumeStride app URL',{exact:true}).fill('http://127.0.0.1:5185/');
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  if(closePopup) await context.route('http://127.0.0.1:5185/',async route=>{await gate;await route.continue();});
  const destinationPromise=context.waitForEvent('page');
  await popup.getByRole('button',{name:'Send reviewed details to ResumeStride'}).click();
  const destination=await destinationPromise;
  if(closePopup){await popup.close();release();}
  await expect(destination.getByText('Extension smoke role',{exact:false}).first()).toBeVisible();
  if(!closePopup) await expect(popup.getByRole('status')).toContainText('received');
  await expect(destination.getByLabel('Captured description')).toHaveValue('Support customers and document solutions.');
  await expect.poll(()=>worker.evaluate(async()=>(await (globalThis as any).chrome.storage.session.get('pendingCapture')).pendingCapture)).toBeUndefined();
  expect(new URL(destination.url()).search).toBe('');
  expect(new URL(destination.url()).hash).toBe('');
 } finally {await context.close();}
});

test('installed worker rejects invalid destinations, oversized captures and non-popup senders',async()=>{
 const extensionPath=resolve('apps/extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
 try {
  const manager=await context.newPage();await manager.goto('chrome://extensions/');
  const item=manager.locator('extensions-item').filter({hasText:'ResumeStride Job Capture'});
  await expect(item).toHaveCount(1);
  const id=await item.getAttribute('id');expect(id).toBeTruthy();
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  const initialPages=context.pages().length;
  const results=await popup.evaluate(`(async()=>{
   const capture={title:'Fictional role',company:'Example',description:'Test only',sourceUrl:'https://example.com/job',capturedAt:new Date().toISOString()};
   const send=(appUrl,captureValue=capture)=>chrome.runtime.sendMessage({type:'resumestride:send-reviewed-job',appUrl,capture:captureValue});
   return await Promise.all([
    send('https://example.com/'),
    send('http://127.0.0.1:9999/'),
    send('http://127.0.0.1:5185/',{...capture,description:'x'.repeat(12001)}),
    send('http://127.0.0.1:5185/',{...capture,title:42})
   ]);
  })()`);
  expect(results).toEqual(Array(4).fill({received:false}));
  // Same extension origin is insufficient: the worker accepts only the exact popup URL.
  await popup.goto(`chrome-extension://${id}/popup.html?unexpected-sender`);
  const rejected=await popup.evaluate(`(async()=>{
   try {
    const result=await chrome.runtime.sendMessage({type:'resumestride:send-reviewed-job',appUrl:'http://127.0.0.1:5185/',capture:{title:'Rejected',company:'Example',description:'Test',sourceUrl:'',capturedAt:''}});
    return result?.received !== true;
   } catch {return true;}
  })()`);
  expect(rejected).toBe(true);
  expect(context.pages()).toHaveLength(initialPages);
 } finally {await context.close();}
});

// CDP's extension action invokes Chrome's toolbar-action path and activeTab grant.
// Observe the popup's production storage write without attaching a Playwright Page to
// Chrome's short-lived `other` target. Review/edit/send is covered separately above.
// No test injection or storage seeding may manufacture the post-action capture.
test('installed toolbar action grants activeTab on Greenhouse without a job-host permission', { tag: '@toolbar' }, async () => {
 const extensionPath = resolve('apps/extension');
 const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: ['--enable-unsafe-extension-debugging', `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
 try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const url = 'https://job-boards.greenhouse.io/example/jobs/123';
  await context.route(url, route => route.fulfill({ contentType: 'text/html', body: '<h1>Controlled public job fixture</h1>' }));
  await context.route('https://boards-api.greenhouse.io/**', route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(route.request().url().includes('/jobs/') ? { id: 123, title: 'Toolbar support role', content: '<p>Support customers.</p>' } : { name: 'Example' }) }));
  const fixture = await context.newPage(); await fixture.goto(url); await fixture.bringToFront();
  const permission = await worker.evaluate(async () => {
    const api = (globalThis as any).chrome;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Expected an active fixture tab before invoking the action');
    try { await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/inject/extract-job.js'] }); return { tabId: tab.id, error: '' }; }
    catch (error) { return { tabId: tab.id, error: String(error) }; }
  });
  // Chromium's pre-action host-permission denial wording varies by version: older
  // builds name the URL directly, newer builds reference "the page" generically.
  // Either wording proves the same denial; assert tolerantly but still require it.
  const deniesHostPermission = permission.error.includes('Cannot access contents of url') || permission.error.includes('Cannot access contents of the page');
  expect(deniesHostPermission).toBe(true);
  expect(permission.error).toMatch(/manifest must request permission to access the respective host|Cannot access contents of url/);
  if (permission.error.includes('Cannot access contents of url')) expect(permission.error).toContain(url);
  const browser = context.browser();
  if (!browser) throw new Error('Expected a browser for the persistent extension context');
  // The browser-level action requires the enclosing tab target, not its child page.
  // Explicitly include tabs: Target.getTargets excludes them by default.
  const browserCdp = await browser.newBrowserCDPSession();
  const { targetInfos } = await browserCdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  expect(fixture.url()).toBe(url);
  const fixtureTabs = targetInfos.filter(target => target.type === 'tab' && target.url === url);
  expect(fixtureTabs, 'Expected exactly one tab target for the controlled fixture URL').toHaveLength(1);
  const [fixtureTab] = fixtureTabs;
  expect(fixtureTab).toMatchObject({ type: 'tab', url });
  expect(fixtureTab.targetId).toEqual(expect.any(String));
  expect(fixtureTab.targetId).not.toBe('');
  // Register and acknowledge the observer before the single toolbar invocation.
  // It survives popup dismissal and also catches a write before triggerAction returns.
  // Only the actual popup runs the extractor and writes pendingCapture.
  await worker.evaluate(async () => {
    const state = globalThis as any;
    const api = state.chrome;
    if ((await api.storage.session.get('pendingCapture')).pendingCapture !== undefined) {
      throw new Error('Toolbar proof requires an empty capture session');
    }
    state.toolbarCapture = new Promise(resolve => {
      const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
        if (area !== 'session' || !changes.pendingCapture?.newValue) return;
        api.storage.onChanged.removeListener(onChanged);
        resolve(changes.pendingCapture.newValue);
      };
      api.storage.onChanged.addListener(onChanged);
    });
  });
  const triggeredAt = Date.now();
  await browserCdp.send('Extensions.triggerAction', { id, targetId: fixtureTab.targetId });
  const pending = await worker.evaluate(async () => await (globalThis as any).toolbarCapture);
  expect(pending).toEqual({
    payload: {
      title: 'Toolbar support role', company: 'Example', description: 'Support customers.',
      location: '', site: 'greenhouse', sourceUrl: url, capturedAt: expect.any(String),
    },
    expiresAt: expect.any(Number),
  });
  expect(Date.parse(pending.payload.capturedAt)).toBeGreaterThanOrEqual(triggeredAt);
  expect(Date.parse(pending.payload.capturedAt)).toBeLessThanOrEqual(Date.now());
  expect(pending.expiresAt).toBeGreaterThanOrEqual(triggeredAt + 30 * 60 * 1000);
  expect(pending.expiresAt).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000);
  expect(await worker.evaluate(async () => (await (globalThis as any).chrome.storage.session.get('pendingCapture')).pendingCapture)).toEqual(pending);
  expect(await worker.evaluate(async tabId => (await (globalThis as any).chrome.tabs.get(tabId)).url, permission.tabId)).toBe(url);
 } finally { await context.close(); }
});

test('session retry survives popup closure and expired captures are discarded', async () => {
 const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${resolve('apps/extension')}`, `--load-extension=${resolve('apps/extension')}`] });
 try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByLabel('Job title', { exact: true }).fill('Retry role');
  await expect.poll(() => worker.evaluate(async () => (await (globalThis as any).chrome.storage.session.get('pendingCapture')).pendingCapture?.payload.title)).toBe('Retry role');
  await popup.close();
  const reopened = await context.newPage(); await reopened.goto(`chrome-extension://${id}/popup.html`);
  await expect(reopened.getByLabel('Job title', { exact: true })).toHaveValue('Retry role');
  await worker.evaluate(async () => { const storage = (globalThis as any).chrome.storage.session; const entry = (await storage.get('pendingCapture')).pendingCapture; entry.expiresAt = Date.now() - 1; await storage.set({ pendingCapture: entry }); });
  await reopened.reload();
  await expect(reopened.getByLabel('Job title', { exact: true })).toHaveValue('');
  await expect.poll(() => worker.evaluate(async () => (await (globalThis as any).chrome.storage.session.get('pendingCapture')).pendingCapture)).toBeUndefined();
 } finally { await context.close(); }
});
