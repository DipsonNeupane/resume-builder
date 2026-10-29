import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const assetRoot = resolve(root, 'apps/extension/store-assets');
const extensionRoot = resolve(root, 'apps/extension');

async function renderSvg(browser, sourceName, outputName, width, height) {
  const svg = await readFile(resolve(assetRoot, sourceName), 'utf8');
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}img{display:block;width:100%;height:100%}</style><img alt="" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
  await page.screenshot({ path: resolve(assetRoot, outputName), omitBackground: true });
  await page.close();
}

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  await renderSvg(browser, 'small-promo-440x280.svg', 'small-promo-440x280.png', 440, 280);
  for (const size of [16, 32, 48, 128]) {
    await renderSvg(browser, 'icon-128-source.svg', `../icons/icon-${size}.png`, size, size);
  }
} finally {
  await browser.close();
}

const profile = await mkdtemp(join(tmpdir(), 'apwico-store-assets-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`],
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 375, height: 800 });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.evaluate(async capture => {
    await chrome.storage.session.set({ pendingCapture: { payload: capture, expiresAt: Date.now() + 30 * 60 * 1000 } });
  }, {
    title: 'Customer Experience Lead', company: 'Fictional Example Company',
    description: 'Guide a customer support team, improve service workflows, and document patterns that help people resolve questions.',
    sourceUrl: 'https://careers.example/jobs/customer-experience-lead', capturedAt: new Date().toISOString(), site: 'jsonld',
  });
  await popup.reload();
  const panel = await popup.screenshot();
  const storeShot = await context.newPage();
  await storeShot.setViewportSize({ width: 1280, height: 800 });
  await storeShot.setContent(`<style>html,body{margin:0;width:1280px;height:800px;overflow:hidden;background:#2d0c1b}body{display:grid;place-items:start center;background:radial-gradient(circle at 85% 10%,#722044 0,transparent 38%),linear-gradient(118deg,#2d0c1b,#18060f)}img{display:block;width:375px;height:800px;box-shadow:0 28px 80px #12030acc}</style><img alt="APWICO Job Capture toolbar popup interface" src="data:image/png;base64,${panel.toString('base64')}">`);
  await storeShot.screenshot({ path: resolve(assetRoot, 'capture-review-1280x800.png') });
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}

console.log('Generated Wine + Blush extension store icon, promo tile, and toolbar-popup screenshot.');
