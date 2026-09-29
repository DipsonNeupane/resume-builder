// How does each bundled font's U+2019 survive PDF text extraction?
// Uses the same data:-URI embedding as the PDF path and asserts the font really loaded.
import { chromium } from '@playwright/test';
import puppeteer from 'puppeteer-core';
import { PDFParse } from 'pdf-parse';
import { embeddedFonts } from '../export/premium-pdf';
const fonts = await embeddedFonts();
const families = process.argv.slice(2).length ? process.argv.slice(2) : ['Newsreader', 'Source Sans 3', 'IBM Plex Sans', 'IBM Plex Sans Condensed', 'IBM Plex Mono', 'Instrument Sans', 'Instrument Serif', 'Noto Sans'];
const browser = await puppeteer.launch({ executablePath: chromium.executablePath(), headless: true });
for (const family of families) for (const variant of ['', 'font-style:italic;', 'font-weight:700;']) {
 const page = await browser.newPage();
 await page.setContent(`<style>${fonts}</style><p style="font-family:'${family}',monospace;${variant}">company’s ‘q’ “d”</p>`, { waitUntil: 'load' });
 const loaded = await page.evaluate(([f, v]) => [...document.fonts].some(ff => ff.family.replace(/"/g, '') === f && ff.status === 'loaded' && (ff.style === 'italic') === v.includes('italic')), [family, variant]);
 const parser = new PDFParse({ data: await page.pdf() }); const text = (await parser.getText()).text; await parser.destroy(); await page.close();
 const cps = [...text].filter(c => /[’‘ʼʻ“”]/.test(c)).map(c => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'));
 console.log(family.padEnd(24), (variant || 'regular').padEnd(20), loaded ? 'loaded ' : 'NOT LOADED', cps.join(' '));
}
await browser.close();
