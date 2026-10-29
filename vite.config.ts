import { defineConfig, type Plugin, type Connect } from 'vite';
import { requestSeo } from './src/seo/policy';

// Source modules outside src/ that the browser app imports during development:
// the shared extension capture contract, and the self-contained Vercel middleware
// that src/seo/policy.ts re-exports. Exact paths only (Vite may add a query).
export const devSourceModules: ReadonlySet<string> = new Set(['/apps/extension/src/lib/capture.ts', '/middleware.ts', '/template-library/fixtures.ts', '/template-library/templates/index.tsx']);

export function seoPolicy() {
 const handler = (development: boolean): Connect.NextHandleFunction => (req, res, next) => {
  const url = new URL(req.url || '/', 'http://localhost');
  // Vite's development module graph is not part of the production URL space.
  // Preview serves built assets and must retain production's source-path 404s.
  if (development && (/^\/(?:@|src\/|node_modules\/|template-library\/)/.test(url.pathname) || devSourceModules.has(url.pathname))) return next();
  const result = requestSeo(url, false);
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  if (result.status) { res.statusCode = result.status; res.end(req.method === 'HEAD' ? undefined : result.body); }
  // Vercel functions do not run under Vite. Without this, /api/x would be served as the
  // transformed api/x.ts module, pulling server-only packages into the dev optimizer
  // (which then reloads open pages). Unmocked calls get the same unavailable answer.
  else if (development && /^\/api(?:\/|$)/.test(url.pathname)) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(req.method === 'HEAD' ? undefined : '{"error":"API functions are not served by the Vite dev server."}'); }
  else {
   // Vite's SPA fallback does not resolve trailing-slash public directories to
   // their index files. Keep the browser's clean canonical URL while serving
   // the generated resource document in development and preview.
   if ((url.pathname.startsWith('/resources/') || url.pathname.startsWith('/tools/') || url.pathname.startsWith('/templates/') || url.pathname.startsWith('/features/') || url.pathname.startsWith('/occupations/') || url.pathname.startsWith('/regions/') || url.pathname.startsWith('/compare/') || url.pathname==='/pricing/' || url.pathname==='/trust/') && url.pathname.endsWith('/')) req.url = `${url.pathname}index.html${url.search}`;
   next();
  }
 };
 return { name: 'apwico-seo-policy', configureServer(server) { server.middlewares.use(handler(true)); }, configurePreviewServer(server) { server.middlewares.use(handler(false)); } } satisfies Plugin;
}
// Scan only the pages this dev server runs. The default scan also crawls
// apps/extension/popup.html, whose dist/ script exists only after an extension
// build; that failure skips pre-bundling, so Vite discovers dependencies at
// runtime and force-reloads open pages (non-deterministic browser tests).
export default defineConfig({ plugins: [seoPolicy()], optimizeDeps: { entries: ['index.html', 'template-library/lab/index.html'] } });
