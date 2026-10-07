import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const source = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function render(size, path) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
  await page.locator('svg').screenshot({ path, omitBackground: true });
}

await render(32, 'public/favicon.png');
await render(64, 'public/.favicon-64.png');
await render(180, 'public/apple-touch-icon.png');
await render(192, 'public/favicon-192.png');
await render(512, 'public/favicon-512.png');
await browser.close();

const png = readFileSync('public/.favicon-64.png');
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 64;
header[7] = 64;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync('public/favicon.ico', Buffer.concat([header, png]));
unlinkSync('public/.favicon-64.png');
