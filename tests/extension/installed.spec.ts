import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';

async function extensionContext() {
  return chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${resolve('apps/extension')}`, `--load-extension=${resolve('apps/extension')}`] });
}

test('installed extension saves through the APWICO page without receiving authentication data', async () => {
  const context = await extensionContext();
  try {
    await context.addInitScript(() => window.addEventListener('message', event => {
      if (event.source === window && event.data?.type === 'resumestride:job-save-request') window.postMessage({ type: 'resumestride:job-save-result', requestId: event.data.requestId, status: 'saved' }, location.origin);
    }));
    const manager = await context.newPage(); await manager.goto('chrome://extensions/');
    const item = manager.locator('extensions-item').filter({ hasText: 'APWICO Job Capture' });
    const id = await item.getAttribute('id'); expect(id).toBeTruthy();
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByRole('heading', { name: 'No job detected on this page' })).toBeVisible();
    await expect(popup.locator('input, textarea, select')).toHaveCount(0);
    const popupBox = await popup.locator('body').boundingBox();
    expect(popupBox?.width).toBe(360); expect(popupBox?.height).toBeLessThanOrEqual(320);
    expect((await new AxeBuilder({ page: popup }).analyze()).violations).toEqual([]);
    const result = await popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'resumestride:save-job', appUrl: 'http://127.0.0.1:5185/', capture: { title: '', company: '', description: '', site: 'linkedin', sourceUrl: 'https://www.linkedin.com/jobs/view/123', capturedAt: new Date().toISOString() } }));
    expect(result).toMatchObject({ status: 'saved', tabId: expect.any(Number) });
    expect(context.pages().some(page => page.url() === 'http://127.0.0.1:5185/')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/token|owner|email/i);
  } finally { await context.close(); }
});

test('installed worker rejects unsafe destinations, private URLs, malformed captures and non-popup senders', async () => {
  const context = await extensionContext();
  try {
    const manager = await context.newPage(); await manager.goto('chrome://extensions/');
    const item = manager.locator('extensions-item').filter({ hasText: 'APWICO Job Capture' });
    const id = await item.getAttribute('id'); expect(id).toBeTruthy();
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
    const initialPages = context.pages().length;
    const results = await popup.evaluate(async () => {
      const capture = { title: '', company: '', description: '', sourceUrl: 'https://example.com/job', capturedAt: new Date().toISOString() };
      const send = (appUrl: string, captureValue: unknown = capture) => chrome.runtime.sendMessage({ type: 'resumestride:save-job', appUrl, capture: captureValue });
      return Promise.all([send('https://example.com/'), send('http://127.0.0.1:9999/'), send('http://127.0.0.1:5185/', { ...capture, sourceUrl: 'https://127.0.0.1/job' }), send('http://127.0.0.1:5185/', { ...capture, title: 42 })]);
    });
    expect(results.every(result => result.status === 'error')).toBe(true);
    await popup.goto(`chrome-extension://${id}/popup.html?unexpected-sender`);
    const rejected = await popup.evaluate(async () => {
      try { const result = await chrome.runtime.sendMessage({ type: 'resumestride:save-job', appUrl: 'http://127.0.0.1:5185/', capture: { title: '', company: '', description: '', sourceUrl: 'https://example.com/job', capturedAt: new Date().toISOString() } }); return result?.status !== 'saved'; }
      catch { return true; }
    });
    expect(rejected).toBe(true);
    expect(context.pages()).toHaveLength(initialPages);
  } finally { await context.close(); }
});

test('installed toolbar action grants activeTab and classifies a job without job-site permissions', { tag: '@toolbar' }, async () => {
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: ['--enable-unsafe-extension-debugging', `--disable-extensions-except=${resolve('apps/extension')}`, `--load-extension=${resolve('apps/extension')}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const url = 'https://job-boards.greenhouse.io/example/jobs/123';
    await context.route(url, route => route.fulfill({ contentType: 'text/html', body: '<h1>Controlled public job fixture</h1>' }));
    let apiRequests = 0;
    await context.route('https://boards-api.greenhouse.io/**', route => { apiRequests++; return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(route.request().url().includes('/jobs/') ? { id: 123, title: 'Toolbar support role', content: '<p>Support customers.</p>' } : { name: 'Example' }) }); });
    const fixture = await context.newPage(); await fixture.goto(url); await fixture.bringToFront();
    const permission = await worker.evaluate(async () => { const api = (globalThis as any).chrome; const [tab] = await api.tabs.query({ active: true, currentWindow: true }); try { await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/inject/extract-job.js'] }); return { error: '' }; } catch (error) { return { error: String(error) }; } });
    expect(permission.error).toMatch(/Cannot access contents of url|Cannot access contents of the page/);
    const browser = context.browser(); if (!browser) throw new Error('Expected browser');
    const cdp = await browser.newBrowserCDPSession();
    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
    const target = targetInfos.find(item => item.type === 'tab' && item.url === url); expect(target).toBeTruthy();
    await cdp.send('Extensions.triggerAction', { id, targetId: target!.targetId });
    await expect.poll(() => apiRequests).toBe(2);
  } finally { await context.close(); }
});
