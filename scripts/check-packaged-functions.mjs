// Run against an isolated `vercel build --standalone` output, never live credentials.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
const output = path.resolve(process.argv[2] || '.vercel/output');
// Never inherit real provider credentials into this offline smoke check.
for (const key of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY']) delete process.env[key];
for (const key of ['BILLING_ENABLED', 'AI_ENABLED', 'EXPORTS_ENABLED']) process.env[key] = 'false';
for (const name of ['checkout','subscribe','cancel-subscription','stripe-webhook','billing-status','tailor','export-status','export-pdf','export-docx']) {
 const root = path.join(output, 'functions/api', `${name}.func`);
 process.chdir(root);
 const config = JSON.parse(await readFile('.vc-config.json', 'utf8'));
 const mod = await import(pathToFileURL(path.join(root, config.handler)));
 const result = await mod.default.fetch(new Request(`https://resumestride.com/api/${name}`, {method: name.endsWith('status') ? 'GET' : 'POST'}));
 assert.equal(result.status, 503, `${name} must fail closed`);
 assert.equal(result.headers.get('cache-control'), 'no-store');
 console.log(`${name}: packaged handler loads and fails closed (503)`);
}
const pdfRoot = path.join(output, 'functions/api/export-pdf.func');
process.chdir(pdfRoot);
for (const file of ['src/styles.css','server/export/fonts/NotoSansArabic.ttf','server/export/fonts/NotoSansDevanagari.ttf','node_modules/@fontsource/noto-sans/400.css','node_modules/@fontsource/noto-sans-sc/400.css','node_modules/@sparticuz/chromium/bin/chromium.br']) {
 assert.ok((await stat(path.join(pdfRoot,file))).size > 0, `${file} missing`);
}
const pdfConfig = JSON.parse(await readFile('.vc-config.json', 'utf8'));
assert.equal(pdfConfig.architecture, 'x86_64', 'PDF runtime must match the bundled x64 Chromium binary');
const binary = brotliDecompressSync(await readFile('node_modules/@sparticuz/chromium/bin/chromium.br'));
assert.equal(binary.subarray(0,4).toString('hex'), '7f454c46');
assert.equal(binary.readUInt16LE(18), 62, 'Bundled Chromium must be x64 ELF');
console.log('PDF CSS, fonts and x64 Chromium match configured runtime. Hosted execution requires separate acceptance.');

const {resumeHtml} = await import(pathToFileURL(path.join(pdfRoot,'server/export/render.js')));
const {example} = await import(pathToFileURL(path.join(pdfRoot,'src/model.js')));
const html = await resumeHtml(example());
assert.ok(html.includes('data:font/'));
assert.ok(html.includes('Resume preview'));
console.log('Packaged renderer resolves embedded fonts and builds resume HTML.');
