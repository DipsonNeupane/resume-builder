import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
import { devSourceModules, seoPolicy } from '../../vite.config';
import browserConfig from '../../playwright.config';
import { initialPage, isPublicAttributionLocation, isPublicLocation, isPublicPath, noindex, productionOrigin, publicPages, requestSeo, websiteSchema } from '../../src/seo/policy';
import { guides } from '../../src/content/guides';
import { publicTools } from '../../src/content/tools';
import { capabilities } from '../../src/content/capabilities';
import { library } from '../../template-library/registry';
const read = (file: string) => readFileSync(file, 'utf8');
const policy = (path: string, production = true) => requestSeo(new URL(path, productionOrigin), production);
const publicHtmlFile = (publicPath: string) => publicPath === '/' ? 'index.html' : publicPath.endsWith('/') ? `public${publicPath}index.html` : `public${publicPath}`;

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
   for (const path of ['/', '/privacy.html', '/terms.html', '/?account=1', '/api/tailor', '/not-a-page', '/account', '/jobs/private', '/privacy.html/', '/index.html?account=1', '/src/main.tsx', '/@vite/client', '/node_modules/.vite/deps/react.js?v=test', '/apps/extension/src/lib/capture.ts', '/apps/extension/src/lib/capture.ts?t=123', '/apps', '/apps/private', '/apps/extension/src/lib/capture.ts/extra', '/middleware.ts', '/middleware.ts?t=123', '/middleware.ts/extra', '/middleware']) {
    const request = new IncomingMessage(new Socket());
    request.url = path; request.method = method;
    const response = new ServerResponse(request);
    let ended = false; let body: unknown; let continued = false;
    response.end = ((chunk?: unknown) => { ended = true; body = chunk; return response; }) as typeof response.end;
    handler(request, response, () => { continued = true; });
    const devModule = path.startsWith('/src/') || path.startsWith('/@') || path.startsWith('/node_modules/') || ['/apps/extension/src/lib/capture.ts', '/middleware.ts'].includes(path.split('?')[0]);
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

test('hosting rewrites only the private application namespaces after middleware validation', () => {
 const config = JSON.parse(read('vercel.json')) as { rewrites?: Array<{ source: string; destination: string }> };
 assert.deepEqual(config.rewrites, [
  { source: '/start/:path*', destination: '/index.html' },
  { source: '/workspace/:path*', destination: '/index.html' },
 ]);
 for (const path of ['/start/import', '/start/build', '/start/job', '/start/sample', '/workspace/resume', '/workspace/jobs', '/workspace/jobs/saved', '/workspace/account', '/workspace/pro']) {
  assert.equal(policy(path).status, 0, `${path} must reach the hosting rewrite`);
 }
 assert.equal(policy('/workspace/unknown').status, 404, 'middleware must reject invalid routes before the broad namespace rewrite');
});

test('every module the browser app imports from outside src/ is served by the dev server', () => {
 // A browser import that escapes src/ is requested by path during `npm run dev`. If the dev SEO
 // filter does not allow that exact path it 404s and the whole app renders blank (regression
 // from the self-contained middleware move, where src/seo/policy.ts began importing /middleware.ts).
 const root = path.resolve(import.meta.dirname, '../..');
 const escaping = new Set<string>();
 const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
 for (const file of walk(path.join(root, 'src'))) {
  for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
   const target = path.resolve(path.dirname(file), specifier);
   if (target.startsWith(path.join(root, 'src') + path.sep)) continue;
   const resolved = ['', '.ts', '.tsx'].map(ext => target + ext).find(candidate => existsSync(candidate) && statSync(candidate).isFile());
   assert.ok(resolved, `${path.relative(root, file)} imports unresolved ${specifier}`);
   escaping.add('/' + path.relative(root, resolved).split(path.sep).join('/'));
  }
 }
 assert.ok(escaping.has('/middleware.ts'), 'The browser SEO policy is expected to re-export the self-contained middleware');
 assert.deepEqual([...escaping].sort(), [...devSourceModules].sort());
});

test('robots allows public crawling and the sitemap uses explicit source-owned modification dates', () => {
 const robots = read('public/robots.txt');
 assert.match(robots, /^User-agent: \*$/m); assert.match(robots, /^Allow: \/$/m);
 assert.doesNotMatch(robots, /^Disallow:\s*\//m);
 assert.match(robots, /^Sitemap: https:\/\/apwico.com\/sitemap.xml$/m);
 const xml = read('public/sitemap.xml');
 assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
 const entries = [...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)].map(match => ({ loc: match[1], lastModified: match[2] }));
 assert.deepEqual(entries, Object.entries(publicPages).map(([path, details]) => ({ loc: `${productionOrigin}${path}`, lastModified: details.lastModified })));
 for (const entry of entries) {
  assert.match(entry.lastModified, /^2026-\d{2}-\d{2}$/);
  assert.ok(entry.lastModified <= '2026-09-30', `future or build-time date: ${entry.lastModified}`);
 }
 assert.doesNotMatch(xml.replace(/^<\?xml[^>]+>/, ''), /\?|#|JobPosting/);
});

test('all public source HTML has unique, consistent metadata before JavaScript', () => {
 const titles = new Set(); const descriptions = new Set();
 for (const path of Object.keys(publicPages)) {
  const html = read(publicHtmlFile(path));
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/ )?.[1];
  assert.ok(title && title.includes('APWICO')); assert.ok(description && description.length > 60);
  titles.add(title); descriptions.add(description);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(html.includes(`rel="canonical" href="${productionOrigin}${path}"`));
  assert.ok(html.includes(`property="og:url" content="${productionOrigin}${path}"`));
  assert.ok(html.includes(`property="og:title" content="${title}"`));
  assert.ok(html.includes(`property="og:description" content="${description}"`));
  assert.match(html, /name="robots" content="index, follow"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.ok(html.includes(`property="og:image" content="${productionOrigin}${publicPages[path as keyof typeof publicPages].socialImage}"`));
  assert.ok(html.includes(`name="twitter:image" content="${productionOrigin}${publicPages[path as keyof typeof publicPages].socialImage}"`));
  assert.match(html, /property="og:image:alt" content="Abstract APWICO route card in copper, mint and dark green"/);
  assert.match(html, /rel="preload" href="\/fonts\/brand-sans\.woff2" as="font" type="font\/woff2" crossorigin/);
  assert.match(html, /rel="stylesheet" href="\/fonts\.css"/);
  assert.match(html, /<script src="\/seo-guard.js"><\/script>/);
 }
 assert.equal(titles.size, Object.keys(publicPages).length); assert.equal(descriptions.size, Object.keys(publicPages).length);
 assert.equal(publicPages['/'].title, 'APWICO — Resume Builder, Job Match & Tailoring');
 assert.equal(publicPages['/'].description, 'Build a master resume, find relevant jobs, compare your evidence with each role, and create truthful job-specific versions without changing your original.');
});

test('structured data describes visible public pages without unsupported commercial or outcome claims', () => {
 for (const [path, details] of Object.entries(publicPages)) {
  const html = read(publicHtmlFile(path));
  const schemas = [...html.matchAll(/<script type="application\/ld\+json" data-seo-schema>(.*?)<\/script>/g)];
  assert.equal(schemas.length, 1, path);
  const schema = JSON.parse(schemas[0][1]);
  const nodes = schema['@graph'] ?? [schema];
  assert.ok(nodes.some((node: Record<string, unknown>) => node['@type'] === 'WebPage' && node.url === `${productionOrigin}${path}` && node.name === details.title && node.dateModified === details.lastModified), path);
  if (path === '/') assert.ok(nodes.some((node: Record<string, unknown>) => node['@type'] === 'WebSite' && node.url === `${productionOrigin}/` && node.name === websiteSchema.name));
  assert.deepEqual([...new Set(nodes.map((node: Record<string, unknown>) => node['@type']))].sort(), path === '/' ? ['WebPage', 'WebSite'] : ['WebPage']);
  assert.doesNotMatch(JSON.stringify(schema), /"@type":"(?:JobPosting|Review|AggregateRating|Offer|SearchAction)"|"(?:aggregateRating|offers|price|award)":/);
 }
});

test('canonical public production URLs are indexable and crawlable, previews never are', () => {
 for (const path of Object.keys(publicPages)) {
  assert.equal(policy(path).status, 0); assert.equal(policy(path).headers['X-Robots-Tag'], undefined);
  assert.equal(policy(path, false).headers['X-Robots-Tag'], noindex);
  for (const origin of ['https://preview.vercel.app', 'http://localhost:5173', 'https://apwico.com.evil.test']) {
   const result = requestSeo(new URL(path, origin), true);
   assert.equal(result.headers['X-Robots-Tag'], noindex); assert.equal(result.status, 0);
  }
 }
 assert.equal(isPublicLocation(new URL('/#templates', productionOrigin)), true);
 assert.equal(isPublicLocation(new URL('/#access_token=secret', productionOrigin)), false);
 assert.equal(isPublicAttributionLocation(new URL('/?utm_source=google&utm_medium=organic&utm_campaign=launch', productionOrigin)), true);
 assert.equal(isPublicAttributionLocation(new URL('/?utm_source=google&code=secret', productionOrigin)), false);
 assert.equal(isPublicAttributionLocation(new URL('/?utm_term=private%20content', productionOrigin)), false);
 for (const path of ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/favicon.svg', '/favicon.png', '/favicon-192.png', '/favicon-512.png', '/apple-touch-icon.png']) {
  assert.equal(policy(path).headers['X-Robots-Tag'], undefined);
  assert.equal(policy(path, false).headers['X-Robots-Tag'], noindex);
 }
});

test('query states and private paths never enter the index, canonical or sitemap', () => {
 for (const query of ['account=1', 'pro=1', 'reset=1', 'code=secret', 'token=secret', 'token_hash=secret', 'access_token=secret', 'checkout=success', 'session_id=secret', 'job=id', 'resume=id', 'utm_source=example&code=secret', 'utm_term=private%20content', 'unknown=future']) {
  for (const path of Object.keys(publicPages)) {
   const result = policy(`${path}?${query}`);
   assert.equal(result.status, 0); assert.equal(result.headers['X-Robots-Tag'], noindex);
   assert.equal(result.headers['Cache-Control'], 'private, no-store');
   assert.equal(result.body, ''); assert.equal(result.headers.Location, undefined);
  }
 }
 for (const path of Object.keys(publicPages)) {
  const result = policy(`${path}?utm_source=google&utm_medium=organic&utm_campaign=launch`);
  assert.equal(result.status, 0); assert.equal(result.headers['X-Robots-Tag'], undefined);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
 }
 for (const path of ['/account', '/auth/callback', '/editor', '/resumes/private', '/jobs', '/saved-jobs', '/match', '/tailoring', '/job-resume/123', '/reset', '/token/secret', '/missing', '/privacy.html/', '/404.html', '/apps', '/apps/extension/src/lib/capture.ts', '/apps/extension/src/lib/capture.ts?t=123', '/middleware.ts', '/middleware.ts?t=123']) {
  const result = policy(path); assert.equal(result.status, 404); assert.equal(result.headers['X-Robots-Tag'], noindex);
  assert.match(result.body, /Page not found/); assert.doesNotMatch(result.body, /rel="canonical"|application\/ld\+json/);
 }
 const privateEntries = ['/start/import', '/start/build', '/start/job', '/start/sample', '/workspace/resume', '/workspace/jobs', '/workspace/jobs/saved', '/workspace/account', '/workspace/pro', '/workspace/jobs/11111111-1111-4111-8111-111111111111/match', '/workspace/resumes/11111111-1111-4111-8111-111111111111'];
 for (const path of privateEntries) {
  const result = policy(path);
  assert.equal(result.status, 0); assert.equal(result.headers['X-Robots-Tag'], noindex);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.equal(result.body, '');
  assert.equal(read('public/sitemap.xml').includes(path), false);
 }
 for (const path of ['/workspace/jobs/not-an-id/match', '/workspace/resumes/not-an-id', '/workspace/unknown']) {
  assert.equal(policy(path).status, 404);
 }
 for (const path of ['/api/tailor', '/api/export-pdf', '/api/jobs-account', '/extension-fixture/job-posting.html']) {
  assert.equal(policy(path).status, 0); assert.equal(policy(path).headers['X-Robots-Tag'], noindex);
 }
});

test('domain migration redirects only behind the launch gate and preserves paths and queries', () => {
 for (const url of ['https://resumestride.com/index.html?account=1&code=abc', 'https://www.resumestride.com/index.html?account=1&code=abc']) {
  assert.equal(requestSeo(new URL(url), true).status, 308);
  const staged = requestSeo(new URL(url), true, true);
  assert.equal(staged.status, 307); assert.equal(staged.headers['Cache-Control'], 'private, no-store');
  const result = requestSeo(new URL(url), true, true, true);
  assert.equal(result.status, 301); assert.equal(result.headers['Cache-Control'], 'public, max-age=300'); assert.equal(result.headers.Location, 'https://apwico.com/?account=1&code=abc');
  assert.equal(requestSeo(new URL(result.headers.Location!), true).status, 0);
 }
 const nested = requestSeo(new URL('https://resumestride.com/resources/resume-keywords/?utm_source=legacy'), true, true, true);
 assert.equal(nested.status, 301); assert.equal(nested.headers.Location, 'https://apwico.com/resources/resume-keywords/?utm_source=legacy');
 assert.equal(requestSeo(new URL('https://apwico.com/resources/'), true, true).headers.Location, undefined);
 const legacyApi = new URL('https://resumestride.com/api/export-pdf');
 assert.equal(requestSeo(legacyApi, true, true, true, 'POST').status, 0);
 assert.equal(requestSeo(legacyApi, true, true, true, 'GET').status, 0);
 assert.equal(policy('/index.html').headers.Location, '/');
 assert.equal(policy('/').headers.Location, undefined);
});

test('favicon, app and social metadata refer to real assets without claiming an offline app', () => {
 const manifest = JSON.parse(read('public/site.webmanifest'));
 assert.equal(manifest.name, 'APWICO'); assert.equal(manifest.display, 'browser'); assert.equal(manifest.start_url, '/');
 for (const [file, width, height] of [['favicon.png', 32, 32], ['favicon-192.png', 192, 192], ['favicon-512.png', 512, 512], ['apple-touch-icon.png', 180, 180]] as const) {
  const png = readFileSync(`public/${file}`); assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
 }
 const hashes = new Set<string>();
 for (const details of Object.values(publicPages)) {
  const png = readFileSync(`public${details.socialImage}`);
  assert.equal(png.toString('ascii', 1, 4), 'PNG'); assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  hashes.add(createHash('sha256').update(png).digest('hex'));
  assert.equal(policy(details.socialImage).status, 0);
 }
 assert.equal(hashes.size, Object.keys(publicPages).length, 'each route receives a genuinely distinct social image');
 for (const asset of ['/favicon.ico', '/favicon.svg', '/favicon-192.png', '/favicon-512.png', '/seo-guard.js', '/content-analytics.js', '/resources.css', '/features.css', '/fonts.css', '/fonts/brand-sans.woff2', '/tools.css', '/tools/analysis.js', '/tools/public-tools.js', '/tools/tool-analytics.js', '/templates.css', '/templates-filter.js', '/robots.txt', '/sitemap.xml']) assert.equal(policy(asset).status, 0);
});

test('capability pages are permanent, useful and limited to implemented behavior', () => {
 assert.equal(capabilities.length, 5);
 const hub = read('public/features/index.html');
 for (const capability of capabilities) {
  const route = `/features/${capability.slug}/`;
  assert.ok(Object.hasOwn(publicPages, route)); assert.ok(hub.includes(`href="${route}"`));
  const html = read(publicHtmlFile(route));
  assert.equal((html.match(/<h1>/g) || []).length, 1); assert.ok(html.includes(capability.promise));
  assert.ok(capability.facts.length >= 3); assert.ok(capability.boundaries.length >= 3);
  assert.doesNotMatch(html, /guarantee(?:d)? interview|ATS[- ]friendly|beat the ATS|hiring probability|we (?:apply|submit) for you/i);
 }
});

test('font and cache delivery are local, bounded and safe for private state', () => {
 assert.doesNotMatch(read('src/styles.css'), /fonts\.googleapis|fonts\.gstatic/);
 assert.doesNotMatch(read('public/fonts.css'), /https?:\/\//);
 assert.match(read('public/fonts.css'), /font-display:swap/);
 assert.doesNotMatch(read('template-library/fonts/fonts.css'), /font-display:\s*block/);
 assert.equal(policy('/assets/app-abc123.js').headers['Cache-Control'], 'public, max-age=31536000, immutable');
 assert.equal(policy('/fonts/brand-sans.woff2').headers['Cache-Control'], 'public, max-age=604800, stale-while-revalidate=2592000');
 assert.equal(policy('/social/home.png').headers['Cache-Control'], 'public, max-age=604800, stale-while-revalidate=2592000');
 assert.equal(policy('/features/').headers['Cache-Control'], 'public, max-age=0, must-revalidate');
 assert.equal(policy('/features/?code=secret').headers['Cache-Control'], 'private, no-store');
 assert.equal(policy('/workspace/resume').headers['Cache-Control'], 'private, no-store');
 const hosting = read('vercel.json');
 assert.doesNotMatch(hosting, /fonts\.googleapis|fonts\.gstatic/); assert.match(hosting, /max-age=31536000, immutable/);
});

test('the technical quality gate runs on pull requests and a recurring schedule', () => {
 const workflow = read('.github/workflows/quality-gate.yml');
 assert.match(workflow, /pull_request:/); assert.match(workflow, /workflow_dispatch:/); assert.match(workflow, /schedule:/);
 assert.match(workflow, /npm run quality:gate/); assert.match(workflow, /permissions:\n\s+contents: read/);
});

test('template routes mirror the verified registry and separate preview from purchase',()=>{
 const detailPaths=Object.keys(publicPages).filter(path=>/^\/templates\/[^/]+\/$/.test(path));
 assert.equal(detailPaths.length,library.length);
 for(const item of library){
  const path=`/templates/${item.id}/`;assert.ok(detailPaths.includes(path));
  const html=read(publicHtmlFile(path));
  assert.match(html,new RegExp(`>${item.tier==='free'?'Free':'Premium'}<`));
  assert.ok(html.includes(`href="/start/build?template=${item.id}"`));
  assert.match(html,/Preview first|Preview with my resume/);assert.doesNotMatch(html,/<button[^>]*>[^<]*(?:Buy|Purchase|Checkout)/i);
 }
 assert.equal(library.filter(item=>item.tier==='free').length,7);assert.equal(library.filter(item=>item.tier==='premium').length,20);
});

test('free tools are complete, private-by-design and distinct from paid Match', () => {
 assert.equal(publicTools.length, 3);
 assert.deepEqual(publicTools.map(tool => tool.path), ['/tools/job-requirement-extractor/', '/tools/resume-job-match/', '/tools/resume-bullet-checker/']);
 for (const tool of publicTools) {
  const html = read(publicHtmlFile(tool.path));
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /No signup/); assert.match(html, /Processed only in this browser/);
  if (tool.id === 'resume-job-match') {
   assert.match(html, /not uploaded, placed in the URL or sent to analytics/i);
   assert.match(html, /only the job description—not your resume text—is kept/i);
  } else assert.match(html, /not uploaded, saved, placed in the URL or sent to analytics/i);
  assert.match(html, /data-tool-form/); assert.match(html, /data-tool-cta=/);
  assert.doesNotMatch(html, /(?:score|match)\s*(?:out of 100|\d+\s*%|percentage)|<meter|class="[^"]*score/i);
 }
 const controller = read('public/tools/public-tools.js');
 assert.doesNotMatch(controller, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|console\./);
 assert.match(controller, /sessionStorage\.setItem\(pendingJobKey/);
 assert.match(controller, /description: analyzedJobText/);
 assert.match(controller, /textContent/); assert.doesNotMatch(controller, /innerHTML|insertAdjacentHTML/);
 const analytics = read('public/tools/tool-analytics.js');
 assert.match(analytics, /tool_viewed/); assert.match(controller, /tool_started/); assert.match(controller, /tool_completed/); assert.match(controller, /tool_result_reviewed/); assert.match(analytics, /tool_cta_clicked/);
 assert.match(analytics, /attributionKeys/); assert.match(analytics, /eventKeys/);
 assert.doesNotMatch(analytics, /textarea|resume-text|job-description|FormData|innerText|textContent/);
 const contentAnalytics = read('public/content-analytics.js');
 assert.match(contentAnalytics, /attributionKeys/); assert.match(contentAnalytics, /Object\.entries\(parsed\)/);
});

test('resource content is complete, deliberate and free of disallowed claims', () => {
 assert.equal(guides.length, 12);
 assert.equal(new Set(guides.map(guide => guide.slug)).size, 12);
 for (const guide of guides) {
  assert.ok(guide.sections.length >= 5, guide.slug);
  assert.ok(guide.directAnswer.length > 100, guide.slug);
  assert.equal(guide.related.length, 3, guide.slug);
  const html = read(publicHtmlFile(`/resources/${guide.slug}/`));
  assert.equal((html.match(/<h1>/g) || []).length, 1, guide.slug);
  assert.match(html, /class="direct-answer"/);
  assert.match(html, /data-content-cta=/);
  assert.doesNotMatch(html, /in today(?:'|’)?s competitive job market|guarantee(?:d)? (?:an )?interview|ATS score (?:predicts|guarantees)|keyword percentage (?:predicts|guarantees)|universal job-board/i);
 }
 assert.doesNotMatch(read('public/resources/index.html'), /blog/i);
});

test('public pages have crawlable links connecting all three surfaces', () => {
 const home = read('src/features/home/HomePage.tsx');
 for (const path of ['/tools/', '/resources/', '/privacy.html', '/terms.html']) assert.ok(home.includes(`href="${path}"`));
 for (const file of ['public/privacy.html', 'public/terms.html']) {
  for (const path of ['/', '/privacy.html', '/terms.html']) assert.ok(read(file).includes(`href="${path}"`));
 }
 const hub = read('public/resources/index.html');
 for (const path of Object.keys(publicPages).filter(path => path.startsWith('/resources/') && path !== '/resources/')) assert.ok(hub.includes(`href="${path}"`));
 for (const path of Object.keys(publicPages).filter(path => path.startsWith('/resources/'))) {
  const html = read(publicHtmlFile(path));
  assert.match(html, /href="\/start\/(?:build|job)/);
  assert.ok(html.includes('href="/resources/"'));
 }
 const toolHub = read('public/tools/index.html');
 for (const tool of publicTools) assert.ok(toolHub.includes(`href="${tool.path}"`));
 for (const tool of publicTools) {
  const html = read(publicHtmlFile(tool.path));
  assert.ok(html.includes('href="/tools/"')); assert.ok(html.includes('href="/resources/"'));
 }
 for (const slug of ['tailor-resume-to-job-description', 'compare-resume-to-job-description', 'resume-keywords', 'tailor-resume-without-lying']) {
  assert.match(read(`public/resources/${slug}/index.html`), /href="\/tools\/(?:job-requirement-extractor|resume-job-match|resume-bullet-checker)\//);
 }
});

test('every internal link, script, stylesheet and image in public HTML resolves', () => {
 const runtimePaths = new Set(['/src/main.tsx', '/_vercel/insights/script.js', '/start/sample', '/start/build', '/start/job', '/workspace/pro']);
 for (const publicPath of Object.keys(publicPages)) {
  const html = read(publicHtmlFile(publicPath));
  const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(references.length > 0, `${publicPath} has no public references to verify`);
  for (const reference of references) {
   if (/^(?:mailto:|tel:|data:)/.test(reference)) continue;
   const resolved = new URL(reference, `${productionOrigin}${publicPath}`);
   if (resolved.origin !== productionOrigin) continue;
   if (reference.startsWith('#')) {
    assert.match(html, new RegExp(`\\bid=["']${resolved.hash.slice(1)}["']`), `${publicPath} has a broken same-page link ${reference}`);
    continue;
   }
   if (isPublicPath(resolved.pathname) || runtimePaths.has(resolved.pathname)) continue;
   const candidate = path.join('public', resolved.pathname.replace(/^\//, ''));
   assert.ok(existsSync(candidate) && statSync(candidate).isFile(), `${publicPath} references missing ${reference}`);
  }
 }
});

test('early head guard protects token fragments even before the auth client consumes them', () => {
 for (const [href, isPrivate, blocked] of [
  ['https://apwico.com/', false, false],
  ['https://apwico.com/#templates', false, false],
  ['https://apwico.com/#access_token=secret', true, true],
  ['https://apwico.com/?account=1&code=secret', true, true],
  ['https://apwico.com/?utm_source=google&utm_campaign=launch', false, false],
  ['https://apwico.com/resources/resume-keywords/#placement', false, false],
  ['https://apwico.com/resources/resume-keywords/#access_token-secret', true, true],
  ['https://apwico.com/features/', false, false],
  ['https://apwico.com/features/job-match/#boundaries-title', false, false],
  ['https://apwico.com/templates/boardroom/', false, false],
  ['https://apwico.com/pricing/#export-policy-title', false, false],
  ['https://apwico.com/trust/#customer-proof-title', false, false],
  ['https://apwico.com/workspace/resume', true, true],
  ['https://apwico.com/start/job', true, true],
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
 assert.equal(initialPage(new URL('/?jobs=1', productionOrigin)), 'jobs');
 assert.equal(initialPage(new URL('/?builder=1', productionOrigin)), 'builder');
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
  const favicon = middleware(new Request(`${productionOrigin}/favicon.ico`)); assert.equal(favicon.headers.get('X-Robots-Tag'), null);
  assert.equal(middleware(new Request(`${productionOrigin}/?code=secret`)).headers.get('X-Robots-Tag'), noindex);
  const missing = middleware(new Request(`${productionOrigin}/missing`, { method: 'HEAD' }));
  assert.equal(missing.status, 404); assert.equal(missing.body, null); assert.equal(missing.headers.get('x-middleware-next'), null);
  assert.equal(middleware(new Request('https://www.resumestride.com/')).status, 200);
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
