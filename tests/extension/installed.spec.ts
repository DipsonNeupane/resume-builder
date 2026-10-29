import {test,expect,chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {resolve} from 'node:path';

test('popup remains usable at its bounded Chrome action width',async()=>{
 const extensionPath=resolve('apps/extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
 try {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const popup=await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  for(const width of [360,400]){
   await popup.setViewportSize({width,height:720});
   await expect(popup.getByRole('heading',{name:'Capture job'})).toBeVisible();
   await expect(popup.locator('.notice')).toBeVisible();
   await expect(popup.getByLabel('Job title',{exact:true})).toBeVisible();
   await expect(popup.getByRole('button',{name:'Send to APWICO'})).toBeVisible();
   const layout=await popup.evaluate(()=>{
    const root=document.documentElement;
    const title=document.querySelector('h1')!;
    const input=document.querySelector('input')!;
    const button=document.querySelector('button[type="submit"]')!;
    return {
     viewport:root.clientWidth,
     scrollWidth:root.scrollWidth,
     headingHeight:title.getBoundingClientRect().height,
     inputWidth:input.getBoundingClientRect().width,
     buttonWidth:button.getBoundingClientRect().width,
     buttonHeight:button.getBoundingClientRect().height,
    };
   });
   expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
   expect(layout.headingHeight).toBeLessThan(60);
   expect(layout.inputWidth).toBeGreaterThanOrEqual(320);
   expect(layout.buttonWidth).toBeGreaterThanOrEqual(320);
   expect(layout.buttonHeight).toBeGreaterThanOrEqual(44);
   if(width===360) await popup.screenshot({path:'/tmp/apwico-extension-popup-360.png',fullPage:true});
  }
  await popup.getByLabel('Job title',{exact:true}).focus();
  await expect(popup.getByLabel('Job title',{exact:true})).toBeFocused();
  expect((await new AxeBuilder({page:popup}).analyze()).violations).toEqual([]);
 } finally {await context.close();}
});

test('toolbar popup declares a usable intrinsic Chrome action width', async () => {
 const extensionPath=resolve('apps/extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
 try {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const popup=await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  const intrinsic=await popup.evaluate(()=>{
   const html=getComputedStyle(document.documentElement);
   const body=document.body.getBoundingClientRect();
   return {declaredWidth:html.width,bodyWidth:body.width};
  });
  expect(intrinsic.declaredWidth).toBe('360px');
  expect(intrinsic.bodyWidth).toBe(360);
  await expect(popup.locator('input').first()).toHaveCSS('min-width','0px');
  await expect(popup.locator('button').last()).toHaveCSS('min-width','0px');
 } finally {await context.close();}
});

test('manual real Chrome renders the installed popup at a readable narrow width', async () => {
 test.skip(!process.env.APWICO_REAL_CHROME, 'Requires an unlocked desktop and installed Google Chrome.');
 const extensionPath=resolve('apps/extension');
 const context=await chromium.launchPersistentContext('',{channel:'chrome',headless:false,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 try {
  const browser=context.browser();if(!browser)throw new Error('Expected a real Chrome browser context');
  const cdp=await browser.newBrowserCDPSession();
  const loaded=await cdp.send('Extensions.loadUnpacked',{path:extensionPath}) as {id:string};
  const id=loaded.id;
  expect(id).toMatch(/^[a-p]{32}$/);
  await expect.poll(()=>context.serviceWorkers().some(worker=>new URL(worker.url()).host===id)).toBe(true);
  const popup=await context.newPage();
  await popup.setViewportSize({width:360,height:720});
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.getByRole('heading',{name:'Capture job'})).toBeVisible();
  const layout=await popup.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,inputWidth:document.querySelector('input')!.getBoundingClientRect().width,buttonWidth:document.querySelector('button[type="submit"]')!.getBoundingClientRect().width}));
  expect(layout.innerWidth).toBe(360);
  expect(layout.scrollWidth).toBeLessThanOrEqual(360);
  expect(layout.inputWidth).toBeGreaterThanOrEqual(320);
  expect(layout.buttonWidth).toBeGreaterThanOrEqual(320);
  await popup.screenshot({path:'/tmp/apwico-extension-025-real-chrome-popup.png',fullPage:true});
 } finally {await context.close();}
});

for (const closePopup of [false,true]) test(`unpacked extension delivers reviewed text${closePopup ? ' after popup closes' : ' through real Chrome APIs'}`,async()=>{
 const extensionPath=resolve('apps/extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
 try {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByLabel('Job title' ,{exact:true}).fill('Extension smoke role');
  await popup.getByLabel('Company',{exact:true}).fill('Acme Corp');
  await popup.getByLabel('Job description',{exact:true}).fill('Support customers and document solutions.');
  await popup.getByText('Optional details',{exact:true}).click();
  await popup.getByLabel('Source URL',{exact:true}).fill('https://jobs.example/roles/extension-smoke');
  await popup.locator('#app').screenshot({path:'/tmp/rs-premium-extension-review.png'});
  await popup.getByText('Developer options', {exact:true}).click();
  await popup.getByLabel('Developer destination',{exact:true}).fill('http://127.0.0.1:5185/');
  const destinationPromise=context.waitForEvent('page');
  await popup.getByRole('button',{name:'Send to APWICO'}).click();
  const destination=await destinationPromise;
  if(closePopup)await popup.close();
  await expect(destination.getByLabel('Captured job title')).toHaveValue('Extension smoke role');
  if(!closePopup) await expect(popup.locator('.status')).toContainText('Sent. APWICO is open');
  await expect(destination.getByLabel('Captured description')).toHaveValue('Support customers and document solutions.');
  await expect.poll(()=>worker.evaluate(async()=>(await (globalThis as any).chrome.storage.session.get('pendingCapture')).pendingCapture)).toBeUndefined();
  expect(new URL(destination.url()).search).toBe('');
  expect(new URL(destination.url()).hash).toBe('');
 } finally {await context.close();}
});

test('manual review cannot claim delivery without a canonical public HTTPS source',async()=>{
 const extensionPath=resolve('apps/extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  const initialPages=context.pages().length;
  await popup.getByLabel('Job title',{exact:true}).fill('Manual role');await popup.getByLabel('Company',{exact:true}).fill('Example');await popup.getByLabel('Job description',{exact:true}).fill('Build accessible customer software.');
  await popup.getByRole('button',{name:'Send to APWICO'}).click();
  await expect(popup.locator('.status')).toHaveText('Add the public HTTPS job source URL before sending.');
  await expect(popup.getByLabel('Source URL',{exact:true})).toBeFocused();
  expect(context.pages()).toHaveLength(initialPages);
 }finally{await context.close();}
});

test('installed worker rejects invalid destinations, oversized captures and non-popup senders',async()=>{
 const extensionPath=resolve('apps/extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
 try {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
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
    descriptionComplete: true,
    warnings: [],
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

test('session retry data survives popup closure and expired captures are discarded', async () => {
 const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${resolve('apps/extension')}`, `--load-extension=${resolve('apps/extension')}`] });
 try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByLabel('Job title', { exact: true }).fill('Retry role');
  await expect.poll(() => worker.evaluate(async () => (await (globalThis as any).chrome.storage.session.get('pendingCapture')).pendingCapture?.payload.title)).toBe('Retry role');
  await popup.close();
  await expect.poll(() => worker.evaluate(async () => (await (globalThis as any).chrome.storage.session.get('pendingCapture')).pendingCapture?.payload.title)).toBe('Retry role');
  await worker.evaluate(async () => { const storage = (globalThis as any).chrome.storage.session; const entry = (await storage.get('pendingCapture')).pendingCapture; entry.expiresAt = Date.now() - 1; await storage.set({ pendingCapture: entry }); });
  const reopened = await context.newPage(); await reopened.goto(`chrome-extension://${id}/popup.html`);
  await expect(reopened.getByLabel('Job title', { exact: true })).toHaveValue('');
  await expect.poll(() => worker.evaluate(async () => (await (globalThis as any).chrome.storage.session.get('pendingCapture')).pendingCapture)).toBeUndefined();
 } finally { await context.close(); }
});
