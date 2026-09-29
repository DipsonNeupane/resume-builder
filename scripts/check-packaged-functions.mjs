// Run against an isolated `vercel build --standalone` output, never live credentials.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
const output = path.resolve(process.argv[2] || '.vercel/output');
// Never inherit real provider credentials into this offline smoke check.
for (const key of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','TECHMAP_API_KEY']) delete process.env[key];
for (const key of ['BILLING_ENABLED', 'AI_ENABLED', 'EXPORTS_ENABLED']) process.env[key] = 'false';
{
 const root = path.join(output, 'functions/middleware.func');
 process.chdir(root);
 const config = JSON.parse(await readFile('.vc-config.json', 'utf8'));
 const entry = await readFile(config.entrypoint, 'utf8');
 assert.doesNotMatch(entry, /src\/seo\/policy/, 'Packaged middleware must not reference application source modules');
 assert.doesNotMatch(entry, /^\s*import(?:\s|\()/m, 'Packaged middleware must be self-contained');
 const previousVercelEnv = process.env.VERCEL_ENV;
 try {
  process.env.VERCEL_ENV = 'production';
  const mod = await import(pathToFileURL(path.join(root, config.entrypoint)));
  const home = await mod.default(new Request('https://resumestride.com/'));
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('x-middleware-next'), '1');
  assert.equal(home.headers.get('x-robots-tag'), null);
  const api = await mod.default(new Request('https://resumestride.com/api/tailor'));
  assert.equal(api.headers.get('x-middleware-next'), '1');
  assert.equal(api.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  const missing = await mod.default(new Request('https://resumestride.com/not-a-page', { method: 'HEAD' }));
  assert.equal(missing.status, 404);
  assert.equal(missing.body, null);
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
 } finally {
  if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previousVercelEnv;
 }
 console.log('Packaged middleware is self-contained and preserves SEO continuation and real 404 behavior.');
}
{
 const root = path.join(output, 'functions/api/export-docx.func');
 const handler = await readFile(path.join(root, 'server/export/docx-handler.js'), 'utf8');
 assert.doesNotMatch(handler, /src\/services\/docx\.js/, 'Packaged DOCX export must not pull in the browser import/parser graph');
 assert.match(handler, /src\/services\/docx-format\.js/, 'Packaged DOCX export must use the dependency-free format module');
 assert.ok((await stat(path.join(root, 'src/services/docx-format.js'))).size > 0, 'Packaged DOCX format module missing');
 console.log('Packaged DOCX handler uses the dependency-free runtime format module.');
}
for (const name of ['checkout','subscribe','cancel-subscription','stripe-webhook','billing-status','tailor','export-status','export-pdf','export-docx','jobs-search','jobs-account']) {
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

// Exercise the Premium module graph directly. Local TS/bundler tests resolve
// extensionless and directory imports, but the deployed Node ESM function does
// not; this catches that production-only packaging failure before deployment.
const {premiumHtml} = await import(pathToFileURL(path.join(pdfRoot,'template-library/export/premium-pdf.js')));
const premium = await premiumHtml({...example(), template:'mandate'}, 'mandate');
assert.ok(premium.includes('data:font/'));
assert.ok(premium.includes('pt-mandate'));
const premiumRuntime = await readFile(path.join(pdfRoot,'template-library/export/premium-pdf.js'),'utf8');
const renderRuntime = await readFile(path.join(pdfRoot,'server/export/render.js'),'utf8');
assert.match(premiumRuntime,/args:\s*target\.args\s*\?\?\s*\[\]/,'Premium Chromium launch args missing');
assert.match(renderRuntime,/args:\s*executablePath\s*\?\s*\[\]\s*:\s*chromium\.args/,'Lambda Chromium args not forwarded');
console.log('Packaged Premium renderer loads its complete Node ESM graph and builds Mandate HTML.');
