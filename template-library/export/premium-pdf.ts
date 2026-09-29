// PDF path for Premium templates. Mirrors server/export/render.ts: static markup,
// inline CSS, every font embedded as a data: URI, JavaScript off, all network
// requests aborted, Chromium print at 16mm margins. Fonts are the bundled OFL
// files in ../fonts plus the same Noto script fallbacks production embeds.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer, { type Browser } from 'puppeteer-core';
import type { Resume } from '../../src/model';
import type { PremiumId } from '../registry';
// This build-generated bundle keeps the Premium renderer graph self-contained.
// Vercel's Node function tracer otherwise preserves the directory import while
// omitting its TSX dependencies, which fails only in the deployed ESM runtime.
import { PremiumResume } from './premium-templates.generated.mjs';

const require = createRequire(import.meta.url);
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const mime = (file: string) => file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.woff') ? 'font/woff' : 'font/ttf';

async function inlineFonts(css: string, dir: string): Promise<string> {
 let output = css;
 for (const match of css.matchAll(/url\(\.?\/?([^)'"]+)\)/g)) {
  // Only fixed, installed/bundled font files — never user-controlled paths.
  const bytes = await readFile(path.join(dir, match[1]));
  output = output.replace(match[0], `url(data:${mime(match[1])};base64,${bytes.toString('base64')})`);
 }
 return output;
}
let fontsPromise: Promise<string> | undefined;
export function embeddedFonts(): Promise<string> {
 fontsPromise ??= (async () => {
  const parts = [await inlineFonts(await readFile(here('../fonts/fonts.css'), 'utf8'), here('../fonts/'))];
  for (const name of ['noto-sans', 'noto-sans-sc']) {
   const root = path.dirname(require.resolve(`@fontsource/${name}/400.css`));
   parts.push(await inlineFonts(await readFile(path.join(root, '400.css'), 'utf8'), root));
  }
  for (const [family, file] of [['Noto Sans Arabic', 'NotoSansArabic.ttf'], ['Noto Sans Devanagari', 'NotoSansDevanagari.ttf']]) {
   const bytes = await readFile(here(`../../server/export/fonts/${file}`));
   parts.push(`@font-face{font-family:'${family}';font-weight:100 900;src:url(data:font/ttf;base64,${bytes.toString('base64')}) format('truetype')}`);
  }
  return parts.join('\n');
 })();
 return fontsPromise;
}

export async function premiumCss(id: PremiumId): Promise<string> {
 const read = (name: string) => readFile(here(`../templates/${name}`), 'utf8');
 return (await read('base.css')) + '\n' + (await read(`${id}.css`));
}

export async function premiumHtml(resume: Resume, id: PremiumId): Promise<string> {
 const markup = renderToStaticMarkup(createElement(PremiumResume, { id, resume }));
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${await embeddedFonts()}\n${await premiumCss(id)}\n@page{size:${resume.paper};margin:16mm}html,body{margin:0;background:#fff}.pt-paper{font-size:10pt}</style></head><body>${markup}</body></html>`;
}

export async function renderPremiumPdf(resume: Resume, id: PremiumId, target: { executablePath: string } | { browser: Browser }): Promise<Uint8Array> {
 const browser = 'browser' in target ? target.browser : await puppeteer.launch({ executablePath: target.executablePath, headless: true, timeout: 20000 });
 const page = await browser.newPage();
 try {
  await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', request => { void (request.url().startsWith('data:') ? request.continue() : request.abort()); });
  await page.setContent(await premiumHtml(resume, id), { waitUntil: 'load', timeout: 20000 });
  return await page.pdf({ format: resume.paper, preferCSSPageSize: true, printBackground: true, timeout: 20000 });
 } finally {
  await page.close();
  if (!('browser' in target)) await browser.close();
 }
}
