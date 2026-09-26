// Keep the production middleware entry self-contained. Vercel packages this file as
// its own runtime unit, so imports from the application source tree can be absent even
// though they resolve during local TypeScript execution.
export const productionOrigin = 'https://resumestride.com';
export const publicPages = {
 '/': { title: 'ResumeStride — Resume builder for every career', description: 'Build your resume with seven free templates, flexible sections, A4 and US Letter formats, and right-to-left support. Start with your experience.' },
 '/privacy.html': { title: 'Privacy notice | ResumeStride', description: 'Read how ResumeStride handles resume drafts, account information, document uploads, payments and optional AI processing, and how to contact support.' },
 '/terms.html': { title: 'Terms and refunds | ResumeStride', description: 'Read the ResumeStride terms of service, Pro purchase and renewal conditions, refund information, usage limits and support details.' },
} as const;
export const publicAnchors = new Set(['', '#how-it-works', '#templates', '#pricing', '#main-content']);
export type AppPage = 'home' | 'builder' | 'account' | 'pro' | 'jobs';
export const privateMetadata = {
 builder: { title: 'Resume editor | ResumeStride', description: 'Edit and review your resume in your private workspace.' },
 account: { title: 'Account access | ResumeStride', description: 'Sign in, manage your account or recover access to ResumeStride.' },
 pro: { title: 'Pro options | ResumeStride', description: 'Review Pro options and manage your ResumeStride access.' },
 jobs: { title: 'Jobs and Match Analysis | ResumeStride', description: 'Review job opportunities, saved jobs and resume evidence in your account workspace.' },
};
export function isPublicPath(path: string): path is keyof typeof publicPages {
 return Object.hasOwn(publicPages, path);
}
export function isPublicLocation(url: URL): boolean {
 return isPublicPath(url.pathname) && !url.search && publicAnchors.has(url.hash);
}
export function initialPage(url: URL): AppPage {
 if (['account', 'reset', 'code', 'token', 'token_hash', 'error'].some(key => url.searchParams.has(key)) || /(?:access_token|refresh_token|type=recovery|error)=?/.test(url.hash)) return 'account';
 return url.searchParams.has('pro') ? 'pro' : 'home';
}
export const websiteSchema = {
 '@context': 'https://schema.org', '@type': 'WebSite',
 '@id': `${productionOrigin}/#website`, name: 'ResumeStride', url: `${productionOrigin}/`,
 description: publicPages['/'].description, inLanguage: 'en',
};
export const noindex = 'noindex, nofollow, noarchive';
export const notFoundHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><title>Page not found | ResumeStride</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>body{margin:0;background:#0b0a09;color:#f4efe8;font:17px/1.7 system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:80px 22px}h1{font-size:48px;line-height:1;letter-spacing:-.02em}a{color:#f7ae74}</style></head><body><main><h1>Page not found</h1><p>This address does not have a ResumeStride page.</p><nav><a href="/">ResumeStride home</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms and refunds</a></nav></main></body></html>';

// Request policy shared by Vercel middleware and the local Vite adapter. No user
// identity, tokens, forwarded hosts, or content are read into metadata or logs.
export function requestSeo(url: URL, production: boolean) {
 const headers: Record<string, string> = {};
 const canonicalHost = url.origin === productionOrigin;
 if (!production || !canonicalHost || !isPublicLocation(url)) headers['X-Robots-Tag'] = noindex;
 if (url.search) headers['Cache-Control'] = 'private, no-store';
 if (['resumestride.com', 'www.resumestride.com'].includes(url.hostname) &&
     (url.origin !== productionOrigin || url.pathname === '/index.html')) {
  return { status: 308, headers: { ...headers, Location: `${productionOrigin}${url.pathname === '/index.html' ? '/' : url.pathname}${url.search}` }, body: '' };
 }
 if (url.pathname === '/index.html') return { status: 308, headers: { ...headers, Location: `/${url.search}` }, body: '' };
 const asset = ['/robots.txt', '/sitemap.xml', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/social-card.png', '/site.webmanifest', '/seo-guard.js'].includes(url.pathname);
 const infrastructure = /^\/(?:api(?:\/|$)|assets\/|_vercel\/|\.well-known\/)/.test(url.pathname);
 // The extension fixture remains reachable for local installed-extension tests,
 // but must never be an indexable job page.
 const fixture = url.pathname.startsWith('/extension-fixture/');
 if (isPublicPath(url.pathname) || asset || infrastructure || fixture) return { status: 0, headers, body: '' };
 return { status: 404, headers: { ...headers, 'X-Robots-Tag': noindex, 'Content-Type': 'text/html; charset=utf-8' }, body: notFoundHtml };
}

export default function middleware(request: Request): Response {
 const runtime = globalThis as typeof globalThis & { process?: { env?: { VERCEL_ENV?: string } } };
 const result = requestSeo(new URL(request.url), runtime.process?.env?.VERCEL_ENV === 'production');
 if (result.status) return new Response(request.method === 'HEAD' ? null : result.body, { status: result.status, headers: result.headers });
 // Vercel's native continuation protocol, identical to next() without pulling
 // a server SDK into this small middleware. Source:
 // https://github.com/vercel/vercel/blob/main/packages/functions/src/middleware.ts
 return new Response(null, { headers: { ...result.headers, 'x-middleware-next': '1' } });
}
