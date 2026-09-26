import { defineConfig, type Plugin, type Connect } from 'vite';
import { requestSeo } from './src/seo/policy';

// Source modules outside src/ that the browser app imports during development:
// the shared extension capture contract, and the self-contained Vercel middleware
// that src/seo/policy.ts re-exports. Exact paths only (Vite may add a query).
export const devSourceModules: ReadonlySet<string> = new Set(['/apps/extension/src/lib/capture.ts', '/middleware.ts']);

export function seoPolicy() {
 const handler = (development: boolean): Connect.NextHandleFunction => (req, res, next) => {
  const url = new URL(req.url || '/', 'http://localhost');
  // Vite's development module graph is not part of the production URL space.
  // Preview serves built assets and must retain production's source-path 404s.
  if (development && (/^\/(?:@|src\/|node_modules\/)/.test(url.pathname) || devSourceModules.has(url.pathname))) return next();
  const result = requestSeo(url, false);
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  if (result.status) { res.statusCode = result.status; res.end(req.method === 'HEAD' ? undefined : result.body); }
  else next();
 };
 return { name: 'resumestride-seo-policy', configureServer(server) { server.middlewares.use(handler(true)); }, configurePreviewServer(server) { server.middlewares.use(handler(false)); } } satisfies Plugin;
}
export default defineConfig({ plugins: [seoPolicy()] });
