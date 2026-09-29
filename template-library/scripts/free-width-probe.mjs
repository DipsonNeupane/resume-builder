// Reports the production Free paginator's page count at several preview widths (Lab, read-only).
import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
for (const t of ['modern', 'classic', 'minimal', 'compact', 'bold', 'executive', 'ledger']) {
 const row = [];
 for (const w of ['desktop', 'mobile']) {
  await p.goto(`http://127.0.0.1:5178/?t=${t}&f=builder-example&w=${w}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
  row.push(`${w} ${await p.getAttribute('.lab-stage .paginated-preview', 'data-page-count')}`);
 }
 console.log(t.padEnd(10), row.join('  '));
}
await b.close();
