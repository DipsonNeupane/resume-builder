// Template Lab verification. Requires the lab running on :5178
//   npx vite --config template-library/lab/vite.config.ts
//   node --import tsx template-library/scripts/verify.ts   [ONLY=boardroom,mandate]
// Premium: every renderer × every fixture × A4/Letter (desktop) + A4 at 360px:
// text completeness, clipping, overlap, links, page counts; PDF text, page parity
// with the preview, apostrophe fidelity. Free: lab sanity + production PDF pages.
// DOCX: production renderer, all text preserved.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import puppeteer from 'puppeteer-core';
import { PDFParse } from 'pdf-parse';
import { validateAll, freeTemplates, isResume, type Resume } from '../../src/model';
import { renderDocx } from '../../server/export/docx';
import { renderPdf } from '../../server/export/render';
import { fixtures } from '../fixtures';
import { premiumRenderers } from '../templates';
import type { PremiumId } from '../registry';
import { renderPremiumPdf } from '../export/premium-pdf';

const lab = process.env.LAB_URL ?? 'http://127.0.0.1:5178';
const out = process.env.OUT_DIR ?? '/tmp/resumestride-template-lab';
const only = process.env.ONLY?.split(',');
const ids = (Object.keys(premiumRenderers) as PremiumId[]).filter(id => !only || only.includes(id));
const papers = ['A4', 'Letter'] as const;
const failures: string[] = [];
const fail = (msg: string) => { failures.push(msg); console.log(`  ✗ ${msg}`); };

const metaLabel = /^[•●▪◦\-–*]?\s*(stack|tech stack|tech|technologies|tools|methods|link|links|url|repo|repository|demo|website|portfolio|doi|authors|co-authors|role|client|scope|outcome):\s+/i;
/** Every word the user typed, which must appear in the rendered document. */
export function expectedWords(r: Resume): string[] {
 const values = [r.name, r.headline, r.email, r.phone, r.location, r.website, r.summary, r.skills];
 if (r.summary.trim()) values.push(r.profileHeading);
 if (r.skills.trim()) values.push(r.skillsHeading);
 for (const s of r.sections) {
  const entries = s.entries.filter(e => [e.title, e.organization, e.location, e.dates, e.description].some(v => v.trim()));
  if (!entries.length) continue;
  values.push(s.title);
  for (const e of entries) values.push(e.title, e.organization, e.location, e.dates, ...e.description.split('\n').map(l => l.replace(metaLabel, '')));
 }
 return [...new Set(values.join(' ').replace(/https?:\/\//gi, '').replace(/\bwww\./gi, '').split(/\s+/)
  .map(w => w.replace(/^[•●▪◦\-–*“”"'(]+|[.,;:!?)”"'/،]+$/g, '').toLowerCase()).filter(w => w.length > 1))];
}
// Straight/curly quote equivalence only; U+02BC is deliberately NOT equivalent.
const squash = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, '');
const missingFrom = (text: string, r: Resume) => { const t = squash(text); return expectedWords(r).filter(w => !t.includes(squash(w))); };

async function inspect(page: Page) {
 return page.evaluate(() => {
  const root = document.querySelector<HTMLElement>('.lab-stage .lab-pages')!;
  const content = root.querySelector('.lab-page-content')!.getBoundingClientRect();
  const paper = root.querySelector<HTMLElement>('.lab-page .pt-paper')!;
  const scale = Number(getComputedStyle(root).getPropertyValue('--scale'));
  const stride = parseFloat(getComputedStyle(root).getPropertyValue('--page-w')) * scale;
  const problems: string[] = [];
  const lineRects: { r: DOMRect; node: Node }[] = [];
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
   if (!n.textContent?.trim()) continue;
   const range = document.createRange(); range.selectNodeContents(n);
   for (const r of range.getClientRects()) {
    if (r.width < .3 || r.height < .3) continue;
    lineRects.push({ r, node: n });
    // every line box sits inside one page's content box (no clipping, no horizontal overflow)
    const col = Math.floor((r.left - content.left + (stride - content.width) / 2) / stride);
    const left = content.left + col * stride, right = left + content.width;
    const slack = Math.max(1, r.height * .3); // ascent/descent boxes may exceed a tight line-height
    if (r.left < left - 1 || r.right > right + 1) problems.push(`overflow x: "${n.textContent!.trim().slice(0, 40)}" (${Math.round(Math.max(left - r.left, r.right - right))}px)`);
    if (r.top < content.top - slack || r.bottom > content.bottom + slack) problems.push(`clipped y: "${n.textContent!.trim().slice(0, 40)}"`);
   }
  }
  for (let i = 0; i < lineRects.length; i++) for (let j = i + 1; j < lineRects.length; j++) {
   const a = lineRects[i], b = lineRects[j];
   if (a.node === b.node) continue;
   const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
   const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
   if (w > 1 && h > Math.min(a.r.height, b.r.height) * .35) problems.push(`overlap: "${a.node.textContent!.trim().slice(0, 30)}" × "${b.node.textContent!.trim().slice(0, 30)}"`);
  }
  for (const a of paper.querySelectorAll('a')) {
   const href = a.getAttribute('href') ?? '';
   try { const u = new URL(href); if (!['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) || (u.protocol.startsWith('http') && !u.hostname.includes('.'))) throw 0; }
   catch { problems.push(`bad link: ${href}`); }
  }
  return { pages: Number(root.getAttribute('data-page-count')), text: paper.textContent ?? '', problems: [...new Set(problems)].slice(0, 12) };
 });
}

async function open(page: Page, query: string, selector: string) {
 await page.goto(`${lab}/?${query}`, { waitUntil: 'load' });
 await page.evaluate(() => document.fonts.ready);
 await page.waitForSelector(selector);
 await page.waitForTimeout(150);
}

async function main() {
 await mkdir(out, { recursive: true });
 for (const f of fixtures) { const r = f.resume(); if (!isResume(r) || validateAll(r).length) fail(`fixture ${f.id} is not a valid exportable Resume`); }
 const browser = await chromium.launch();
 const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(`${page.url()}: ${e.message}`));
 page.on('requestfailed', r => errors.push(`request failed ${r.url()}`));
 page.on('request', r => { if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(r.url())) errors.push(`external request ${r.url()}`); });
 const preview: Record<string, number> = {};
 const key = (id: string, f: string, paper: string) => `${id}/${f}/${paper}`;

 console.log(`Preview checks — ${ids.length} Premium × ${fixtures.length} fixtures × A4, Letter, 360px`);
 for (const id of ids) {
  const row: string[] = [];
  for (const f of fixtures) {
   const resume = f.resume();
   for (const [paper, w] of [['A4', 'desktop'], ['Letter', 'desktop'], ['A4', 'mobile']] as const) {
    await open(page, `t=${id}&f=${f.id}&paper=${paper}&w=${w}`, '.lab-stage .lab-pages.is-measured');
    const found = await inspect(page);
    for (const p of found.problems) fail(`${id}/${f.id}/${paper}/${w}: ${p}`);
    const missing = missingFrom(found.text, resume);
    if (missing.length) fail(`${id}/${f.id}/${paper}/${w}: missing text ${missing.slice(0, 8).join(' | ')}`);
    if (w === 'desktop') preview[key(id, f.id, paper)] = found.pages;
    else if (found.pages !== preview[key(id, f.id, 'A4')]) fail(`${id}/${f.id}: 360px preview ${found.pages}p vs desktop ${preview[key(id, f.id, 'A4')]}p`);
   }
   if (f.id === 'short' && (preview[key(id, 'short', 'A4')] !== 1 || preview[key(id, 'short', 'Letter')] !== 1)) fail(`${id}/short: expected 1 page`);
   if (f.id === 'stress' && preview[key(id, 'stress', 'A4')] < 2) fail(`${id}/stress: expected multi-page`);
   row.push(`${f.id} ${preview[key(id, f.id, 'A4')]}/${preview[key(id, f.id, 'Letter')]}`);
  }
  console.log(`  ${id.padEnd(10)} ${row.join('  ')}`);
 }

 const freePreview: Record<string, number> = {};
 if (!only) {
  console.log('Free templates in the lab (production preview component)');
  for (const id of freeTemplates.map(template=>template.id)) for (const f of fixtures) {
   await open(page, `t=${id}&f=${f.id}`, '.lab-stage .fixed-preview.is-measured');
   freePreview[`${id}/${f.id}`] = Number(await page.getAttribute('.lab-stage .fixed-preview', 'data-page-count'));
  }
 }

 console.log('PDF — Premium (bundled fonts, no network) and page parity with preview');
 const exe = chromium.executablePath();
 const pdfBrowser = await puppeteer.launch({ executablePath: exe, headless: true });
 const mismatches: string[] = [];
 for (const id of ids) {
  const row: string[] = [];
  for (const f of fixtures) for (const paper of papers) {
   const resume = { ...f.resume(), paper };
   const bytes = await renderPremiumPdf(resume, id, { browser: pdfBrowser });
   if (paper === 'A4') await writeFile(`${out}/${id}-${f.id}.pdf`, bytes);
   const parser = new PDFParse({ data: bytes });
   const parsed = await parser.getText(); await parser.destroy();
   if (resume.direction === 'ltr') {
    const missing = missingFrom(parsed.text, resume);
    if (missing.length) fail(`${id}/${f.id}/${paper}: PDF missing ${missing.slice(0, 8).join(' | ')}`);
   }
   if (parsed.text.includes('ʼ') && !JSON.stringify(resume).includes('ʼ')) fail(`${id}/${f.id}/${paper}: PDF text contains U+02BC instead of the typed apostrophe`);
   const p = preview[key(id, f.id, paper)];
   if (parsed.total !== p) { mismatches.push(`${id}/${f.id}/${paper}`); fail(`${id}/${f.id}/${paper}: PDF ${parsed.total}p vs preview ${p}p`); }
   if (paper === 'A4') row.push(`${f.id} ${parsed.total}`);
  }
  console.log(`  ${id.padEnd(10)} ${row.join('  ')}`);
 }
 await pdfBrowser.close();

 const freePdf: Record<string, number> = {};
 if (!only) {
  console.log('PDF — Free (production server/export/render.ts), for reference');
  for (const id of freeTemplates.map(template=>template.id)) for (const f of fixtures) {
   const bytes = await renderPdf({ ...f.resume(), template: id }, exe);
   const parser = new PDFParse({ data: bytes }); const parsed = await parser.getText(); await parser.destroy();
   freePdf[`${id}/${f.id}`] = parsed.total;
  }
  const freeDiff = Object.keys(freePdf).filter(k => freePdf[k] !== freePreview[k]);
  for (const k of freeDiff) fail(`Free ${k}: PDF ${freePdf[k]}p vs preview ${freePreview[k]}p`);
  console.log(`  Free preview vs production PDF differences (production behaviour, reported only): ${freeDiff.length ? freeDiff.map(k => `${k} ${freePreview[k]}→${freePdf[k]}`).join(', ') : 'none'}`);
 }

 console.log('DOCX — production renderer (clean editable document), text preservation');
 for (const f of fixtures) {
  const resume = f.resume();
  const bytes = await renderDocx(resume);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) fail(`docx ${f.id}: not a zip`);
  // The production zip writer uses STORE (no compression): document.xml is readable directly.
  const xml = new TextDecoder().decode(bytes);
  const text = xml.slice(xml.indexOf('<w:document'), xml.lastIndexOf('</w:document>')).replace(/<\/w:p>/g, ' ').replace(/<[^>]+>/g, '')
   .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const missing = missingFrom(text, resume);
  if (missing.length) fail(`docx ${f.id}: missing ${missing.slice(0, 8).join(' | ')}`);
  await writeFile(`${out}/${f.id}.docx`, bytes);
  console.log(`  ${f.id.padEnd(16)} ${bytes.length} bytes, ${missing.length ? 'MISSING TEXT' : 'all text present'}`);
 }
 for (const e of [...new Set(errors)]) fail(e);
 await browser.close();
 await writeFile(`${out}/results.json`, JSON.stringify({ preview, freePreview, freePdf, mismatches, failures }, null, 1));
 console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nALL CHECKS PASSED', `— artefacts in ${out}`);
 process.exit(failures.length ? 1 : 0);
}
await main();
