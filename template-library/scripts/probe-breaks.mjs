// Diagnostic: page-bottom whitespace per page and the height of the first block on the next page.
import { chromium } from '@playwright/test';
const [,, query] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await p.goto(`http://127.0.0.1:5178/?${query}`); await p.evaluate(() => document.fonts.ready); await p.waitForSelector('.lab-pages.is-measured'); await p.waitForTimeout(300);
console.log(JSON.stringify(await p.evaluate(() => {
 const root = document.querySelector('.lab-stage .lab-pages'); const scale = +getComputedStyle(root).getPropertyValue('--scale');
 const content = root.querySelector('.lab-page-content').getBoundingClientRect(); const stride = parseFloat(getComputedStyle(root).getPropertyValue('--page-w')) * scale;
 const paper = root.querySelector('.lab-page .pt-paper');
 return [...paper.children].map(s => { const rs = [...s.getClientRects()]; return { cls: s.className, frags: rs.map(r => ({ page: Math.floor((r.left - content.left + 20) / stride) + 1, top: Math.round((r.top - content.top) / scale), bottom: Math.round((r.bottom - content.top) / scale) })) }; });
})));
await b.close();
