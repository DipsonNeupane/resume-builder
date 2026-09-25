import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import type { Connect } from 'vite';
import middleware from '../../middleware';
import { seoPolicy } from '../../vite.config';
import browserConfig from '../../playwright.config';
import { initialPage, isPublicLocation, noindex, productionOrigin, publicPages, requestSeo, websiteSchema } from '../../src/seo/policy';
const read = (file: string) => readFileSync(file, 'utf8');
const policy = (path: string, production = true) => requestSeo(new URL(path, productionOrigin), production);

test('browser verification always starts its own configured application server', () => {
 const servers = Array.isArray(browserConfig.webServer) ? browserConfig.webServer : [browserConfig.webServer];
 assert.ok(servers.length > 0);
 for (const server of servers) {
  assert.ok(server);
  assert.equal(server.reuseExistingServer, false, 'A reused server can bypass current Vite SEO middleware and test environment settings');
  assert.match(server.command, /--strictPort/);
  assert.equal(server.env?.VITE_SUPABASE_URL, '');
  assert.equal(server.env?.VITE_SUPABASE_PUBLISHABLE_KEY, '');
 }
});

test('Vite dev and preview register HTTP policy before the SPA fallback', () => {
 const plugin = seoPolicy();
 for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
  let handler: Connect.NextHandleFunction | undefined;
  // Capture the real adapter registered by each lifecycle hook without opening
  // a network listener. Returning a post-hook would let SPA fallback run first.
  const server = { middlewares: { use: (middleware: Connect.NextHandleFunction) => { handler = middleware; } } };
  const register = plugin[hook];
  assert.equal(register.call({} as ThisParameterType<typeof register>, server as Parameters<typeof plugin.configureServer>[0] & Parameters<typeof plugin.configurePreviewServer>[0]), undefined);
  assert.ok(handler);
  for (const method of ['GET', 'HEAD']) {
   for (const path of ['/', '/privacy.html', '/terms.html', '/?account=1', '/api/tailor', '/not-a-page', '/account', '/jobs/private', '/privacy.html/', '/index.html?account=1', '/src/main.tsx', '/@vite/client', '/node_modules/.vite/deps/react.js?v=test', '/apps/extension/src/lib/capture.ts', '/apps/extension/src/lib/capture.ts?t=123', '/apps', '/apps/private', '/apps/extension/src/lib/capture.ts/extra']) {
    const request = new IncomingMessage(new Socket());
    request.url = path; request.method = method;
    const response = new ServerResponse(request);
    let ended = false; let body: unknown; let continued = false;
    response.end = ((chunk?: unknown) => { ended = true; body = chunk; return response; }) as typeof response.end;
    handler(request, response, () => { continued = true; });
    const devModule = path.startsWith('/src/') || path.startsWith('/@') || path.startsWith('/node_modules/') || path.split('?')[0] === '/apps/extension/src/lib/capture.ts';
    if (hook === 'configureServer' && devModule) {
     assert.equal(continued, true); assert.equal(ended, false);
     assert.equal(response.getHeader('X-Robots-Tag'), undefined);
     continue;
    }
    assert.equal(response.getHeader('X-Robots-Tag'), noindex, `${hook}: ${method} ${path}`);
    const expected = requestSeo(new URL(path, 'http://localhost'), false);
    assert.equal(response.statusCode, expected.status || 200);
    assert.equal(ended, Boolean(expected.status)); assert.equal(continued, !expected.status);
    if (ended) assert.equal(body, method === 'HEAD' ? undefined : expected.body);
    if (path === '/index.html?account=1') assert.equal(response.getHeader('Location'), '/?account=1');
    if (path.includes('?')) assert.equal(response.getHeader('Cache-Control'), 'private, no-store');
   }
  }
 }
});

test('robots allows public crawling and directs crawlers to the exact public-only sitemap', () => {
 const robots = read('public/robots.txt');
 assert.match(robots, /^User-agent: \*$/m); assert.match(robots, /^Allow: \/$/m);
 assert.doesNotMatch(robots, /^Disallow:\s*\//m);
 assert.match(robots, /^Sitemap: https:\/\/resumestride.com\/sitemap.xml$/m);
 const xml = read('public/sitemap.xml');
 assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
 assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), ['https://resumestride.com/', 'https://resumestride.com/privacy.html', 'https://resumestride.com/terms.html']);
 assert.doesNotMatch(xml.replace(/^<\?xml[^>]+>/, ''), /<lastmod>|\?|#|JobPosting/);
});

test('all public source HTML has unique, consistent metadata before JavaScript', () => {
 const titles = new Set(); const descriptions = new Set();
 for (const path of Object.keys(publicPages)) {
  const html = read(path === '/' ? 'index.html' : `public${path}`);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/ )?.[1];
  assert.ok(title && title.includes('ResumeStride')); assert.ok(description && description.length > 60);
  titles.add(title); descriptions.add(description);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(html.includes(`rel="canonical" href="${productionOrigin}${path}"`));
  assert.ok(html.includes(`property="og:url" content="${productionOrigin}${path}"`));
  assert.ok(html.includes(`property="og:title" content="${title}"`));
  assert.ok(html.includes(`property="og:description" content="${description}"`));
  assert.match(html, /name="robots" content="index, follow"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /property="og:image" content="https:\/\/resumestride.com\/social-card.png"/);
  assert.match(html, /<script src="\/seo-guard.js"><\/script>/);
 }
 assert.equal(titles.size, 3); assert.equal(descriptions.size, 3);
});

test('structured data describes only the real website, with no unsupported product claims', () => {
 const html = read('index.html');
 const schemas = [...html.matchAll(/<script type="application\/ld\+json" data-seo-schema>(.*?)<\/script>/g)];
 assert.equal(schemas.length, 1);
 const schema = JSON.parse(schemas[0][1]);
 assert.deepEqual(schema, websiteSchema);
 assert.equal(schema['@context'], 'https://schema.org'); assert.equal(schema['@type'], 'WebSite');
 assert.equal(schema.url, `${productionOrigin}/`); assert.equal(schema.name, 'ResumeStride');
 assert.doesNotMatch(JSON.stringify(schema), /JobPosting|Review|aggregateRating|offers|price|award|SearchAction/);
 for (const file of ['public/privacy.html', 'public/terms.html']) assert.doesNotMatch(read(file), /application\/ld\+json/);
});

test('canonical public production URLs are indexable and crawlable, previews never are', () => {
 for (const path of Object.keys(publicPages)) {
  assert.equal(policy(path).status, 0); assert.equal(policy(path).headers['X-Robots-Tag'], undefined);
  assert.equal(policy(path, false).headers['X-Robots-Tag'], noindex);
  for (const origin of ['https://preview.vercel.app', 'http://localhost:5173', 'https://resumestride.com.evil.test']) {
   const result = requestSeo(new URL(path, origin), true);
   assert.equal(result.headers['X-Robots-Tag'], noindex); assert.equal(result.status, 0);
  }
 }
 assert.equal(isPublicLocation(new URL('/#templates', productionOrigin)), true);
 assert.equal(isPublicLocation(new URL('/#access_token=secret', productionOrigin)), false);
});

test('query states and private paths never enter the index, canonical or sitemap', () => {
 for (const query of ['account=1', 'pro=1', 'reset=1', 'code=secret', 'token=secret', 'token_hash=secret', 'access_token=secret', 'checkout=success', 'session_id=secret', 'job=id', 'resume=id', 'utm_source=example', 'unknown=future']) {
  for (const path of Object.keys(publicPages)) {
   const result = policy(`${path}?${query}`);
   assert.equal(result.status, 0); assert.equal(result.headers['X-Robots-Tag'], noindex);
   assert.equal(result.headers['Cache-Control'], 'private, no-store');
   assert.equal(result.body, ''); assert.equal(result.headers.Location, undefined);
  }
 }
 for (const path of ['/account', '/auth/callback', '/editor', '/resumes/private', '/jobs', '/saved-jobs', '/match', '/tailoring', '/job-resume/123', '/reset', '/token/secret', '/missing', '/privacy.html/', '/404.html', '/apps', '/apps/extension/src/lib/capture.ts', '/apps/extension/src/lib/capture.ts?t=123']) {
  const result = policy(path); assert.equal(result.status, 404); assert.equal(result.headers['X-Robots-Tag'], noindex);
  assert.match(result.body, /Page not found/); assert.doesNotMatch(result.body, /rel="canonical"|application\/ld\+json/);
 }
 for (const path of ['/api/tailor', '/api/export-pdf', '/api/jobs-account', '/extension-fixture/job-posting.html']) {
  assert.equal(policy(path).status, 0); assert.equal(policy(path).headers['X-Robots-Tag'], noindex);
 }
});

test('hostname and index aliases redirect once, preserving callback queries', () => {
 for (const url of ['http://resumestride.com/index.html?account=1&code=abc', 'https://www.resumestride.com/index.html?account=1&code=abc']) {
  const result = requestSeo(new URL(url), true);
  assert.equal(result.status, 308); assert.equal(result.headers.Location, 'https://resumestride.com/?account=1&code=abc');
  assert.equal(requestSeo(new URL(result.headers.Location!), true).status, 0);
 }
 assert.equal(policy('/index.html').headers.Location, `${productionOrigin}/`);
 assert.equal(policy('/').headers.Location, undefined);
});

test('favicon, app and social metadata refer to real assets without claiming an offline app', () => {
 const manifest = JSON.parse(read('public/site.webmanifest'));
 assert.equal(manifest.name, 'ResumeStride'); assert.equal(manifest.display, 'browser'); assert.equal(manifest.start_url, '/');
 for (const [file, width, height] of [['favicon.png', 32, 32], ['apple-touch-icon.png', 180, 180], ['social-card.png', 1200, 630]] as const) {
  const png = readFileSync(`public/${file}`); assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
 }
 for (const asset of ['/favicon.svg', '/seo-guard.js', '/social-card.png', '/robots.txt', '/sitemap.xml']) assert.equal(policy(asset).status, 0);
});

test('public pages have crawlable links connecting all three surfaces', () => {
 const home = read('src/features/home/HomePage.tsx');
 for (const path of ['/privacy.html', '/terms.html']) assert.ok(home.includes(`href="${path}"`));
 for (const file of ['public/privacy.html', 'public/terms.html']) {
  for (const path of ['/', '/privacy.html', '/terms.html']) assert.ok(read(file).includes(`href="${path}"`));
 }
});

test('early head guard protects token fragments even before the auth client consumes them', () => {
 for (const [href, isPrivate, blocked] of [
  ['https://resumestride.com/', false, false],
  ['https://resumestride.com/#templates', false, false],
  ['https://resumestride.com/#access_token=secret', true, true],
  ['https://resumestride.com/?account=1&code=secret', true, true],
  ['https://preview.vercel.app/', false, true],
 ] as const) {
  const robots = { content: 'index, follow' }; const dataset: Record<string, string> = {}; let removed = 0;
  vm.runInNewContext(read('public/seo-guard.js'), { URL, location: { href }, document: {
   documentElement: { dataset }, querySelector: () => robots, querySelectorAll: () => [{ remove: () => removed++ }],
  } });
  assert.equal(robots.content, blocked ? noindex : 'index, follow');
  assert.equal(dataset.seoPrivateEntry === 'true', isPrivate); assert.equal(removed, isPrivate ? 1 : 0);
 }
 assert.equal(initialPage(new URL('/?reset=1&code=secret', productionOrigin)), 'account');
 assert.equal(initialPage(new URL('/#access_token=secret&type=recovery', productionOrigin)), 'account');
 assert.equal(initialPage(new URL('/?pro=1', productionOrigin)), 'pro');
});

test('Vercel middleware emits HTTP noindex, safe continuation, redirect and HEAD 404 responses', () => {
 const before = process.env.VERCEL_ENV;
 try {
  process.env.VERCEL_ENV = 'production';
  for (const method of ['GET', 'HEAD', 'POST']) {
   const response = middleware(new Request(`${productionOrigin}/api/tailor`, { method }));
   assert.equal(response.headers.get('X-Robots-Tag'), noindex); assert.equal(response.headers.get('x-middleware-next'), '1');
  }
  const home = middleware(new Request(`${productionOrigin}/`)); assert.equal(home.headers.get('X-Robots-Tag'), null);
  assert.equal(middleware(new Request(`${productionOrigin}/?code=secret`)).headers.get('X-Robots-Tag'), noindex);
  const missing = middleware(new Request(`${productionOrigin}/missing`, { method: 'HEAD' }));
  assert.equal(missing.status, 404); assert.equal(missing.body, null); assert.equal(missing.headers.get('x-middleware-next'), null);
  assert.equal(middleware(new Request('https://www.resumestride.com/')).status, 308);
  process.env.VERCEL_ENV = 'preview'; assert.equal(middleware(new Request(`${productionOrigin}/`)).headers.get('X-Robots-Tag'), noindex);
 } finally { if (before === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = before; }
});

test('Vercel middleware package loads without the application source tree', async () => {
 const source = read('middleware.ts');
 assert.doesNotMatch(source, /^\s*import(?:\s|\()/m, 'The Vercel middleware runtime must be self-contained');
 assert.doesNotMatch(source, /src\/seo\/policy/, 'The packaged middleware must not resolve application source modules');
 const compiled = ts.transpileModule(source, {
  fileName: 'middleware.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
 }).outputText;
 const isolated = mkdtempSync(path.join(tmpdir(), 'resumestride-middleware-'));
 const packagedEntry = path.join(isolated, 'middleware.mjs');
 try {
  writeFileSync(packagedEntry, compiled);
  const packaged = await import(`${pathToFileURL(packagedEntry).href}?isolated=${Date.now()}`) as typeof import('../../middleware');
  const home = packaged.default(new Request(`${productionOrigin}/`));
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('x-middleware-next'), '1');
  const missing = packaged.default(new Request(`${productionOrigin}/not-a-page`, { method: 'HEAD' }));
  assert.equal(missing.status, 404);
  assert.equal(missing.body, null);
  assert.equal(missing.headers.get('X-Robots-Tag'), noindex);
 } finally {
  rmSync(isolated, { recursive: true, force: true });
 }
});
