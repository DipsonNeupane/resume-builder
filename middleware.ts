// Keep the production middleware entry self-contained. Vercel packages this file as
// its own runtime unit, so imports from the application source tree can be absent even
// though they resolve during local TypeScript execution.
export const productionOrigin = 'https://resumestride.com';
export const publicPages = {
 '/': { title: 'ResumeStride — Resume Builder, Job Match & Tailoring', description: 'Build a master resume, find relevant jobs, compare your evidence with each role, and create truthful job-specific versions without changing your original.' },
 '/resources/': { title: 'Resume resources: evidence-first job search guides | ResumeStride', description: 'Practical, evidence-first resume guides for comparing roles, deciding whether to apply and tailoring your resume without making things up.' },
 '/resources/tailor-resume-to-job-description/': { title: 'How to tailor a resume to a job description | ResumeStride', description: 'Tailor your resume by mapping the role’s real requirements to evidence you already have—without rewriting everything or adding unsupported claims.' },
 '/resources/should-you-tailor-resume-for-every-job/': { title: 'Should you tailor your resume for every job? | ResumeStride', description: 'Decide when a job deserves a fully tailored resume, a light role-family edit or no application at all—with a practical effort framework.' },
 '/resources/compare-resume-to-job-description/': { title: 'How to compare your resume to a job description | ResumeStride', description: 'Compare a resume with a job description using a requirement-to-evidence table, not a misleading keyword percentage or interview prediction.' },
 '/resources/how-to-know-if-qualified-for-job/': { title: 'How to know if you’re qualified for a job | ResumeStride', description: 'Evaluate job qualifications without arbitrary percentage rules: check eligibility, core work, evidence, transferable experience and genuine gaps.' },
 '/resources/master-resume-vs-tailored-resume/': { title: 'Master resume vs. tailored resume: what to keep in each | ResumeStride', description: 'Learn the difference between a complete master resume and a focused tailored resume, what belongs in each and how to keep versions organized.' },
 '/resources/how-much-resume-should-change/': { title: 'How much should your resume change for each job? | ResumeStride', description: 'Learn what to change, what to keep fixed and when a resume needs a light edit versus a deeper job-specific version.' },
 '/resources/resume-keywords/': { title: 'Resume keywords: what actually belongs in your resume | ResumeStride', description: 'Choose resume keywords that describe real skills, tools, methods and qualifications—and place them where your evidence supports them.' },
 '/resources/tailor-resume-without-lying/': { title: 'How to tailor a resume without lying or making things up | ResumeStride', description: 'Tailor your resume honestly by clarifying, selecting and translating real experience—without inventing skills, titles, results or credentials.' },
 '/tools/': { title: 'Free resume and job search tools | ResumeStride', description: 'Free, private resume and job-description tools: extract requirements, compare evidence and improve resume bullets without ATS scores or signup.' },
 '/tools/job-requirement-extractor/': { title: 'Free job requirement extractor | ResumeStride', description: 'Extract required, preferred and other signals from a job description with source text you can verify. Free, private and no signup required.' },
 '/tools/resume-job-match/': { title: 'Compare your resume to a job description free | ResumeStride', description: 'Compare resume evidence with job requirements—clearly demonstrated, worth reviewing or not demonstrated. No ATS score, signup or upload.' },
 '/tools/resume-bullet-checker/': { title: 'Free resume bullet point checker | ResumeStride', description: 'Check one resume bullet for action, specificity, context, evidence, readability and filler—without an ATS score or invented metrics.' },
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
 return isPublicPath(url.pathname) && !url.search && isPublicAnchor(url.pathname, url.hash);
}
function isPublicAnchor(path: string, hash: string): boolean {
 return path.startsWith('/resources/') || path.startsWith('/tools/') ? hash === '' || /^#[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hash) : publicAnchors.has(hash);
}
const campaignKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
const campaignToken = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/;
export function isPublicAttributionLocation(url: URL): boolean {
 if (!isPublicPath(url.pathname) || !isPublicAnchor(url.pathname, url.hash) || !url.search) return false;
 const seen = new Set<string>();
 for (const [key, value] of url.searchParams) {
  if (!campaignKeys.has(key) || seen.has(key) || !campaignToken.test(value)) return false;
  seen.add(key);
 }
 return seen.size > 0;
}
export function initialPage(url: URL): AppPage {
 if (['account', 'reset', 'code', 'token', 'token_hash', 'error'].some(key => url.searchParams.has(key)) || /(?:access_token|refresh_token|type=recovery|error)=?/.test(url.hash)) return 'account';
 if (url.searchParams.has('jobs')) return 'jobs';
 if (url.searchParams.has('builder')) return 'builder';
 return url.searchParams.has('pro') ? 'pro' : 'home';
}
export const websiteSchema = {
 '@context': 'https://schema.org', '@type': 'WebSite',
 '@id': `${productionOrigin}/#website`, name: 'ResumeStride', url: `${productionOrigin}/`,
 description: publicPages['/'].description, inLanguage: 'en',
};
export const noindex = 'noindex, nofollow, noarchive';
export const notFoundHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><title>Page not found | ResumeStride</title><link rel="icon" href="/favicon.ico" sizes="64x64"><link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any"><link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192"><style>body{margin:0;background:#0b0a09;color:#f4efe8;font:17px/1.7 system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:80px 22px}h1{font-size:48px;line-height:1;letter-spacing:-.02em}a{color:#f7ae74}</style></head><body><main><h1>Page not found</h1><p>This address does not have a ResumeStride page.</p><nav><a href="/">ResumeStride home</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms and refunds</a></nav></main></body></html>';

// Request policy shared by Vercel middleware and the local Vite adapter. No user
// identity, tokens, forwarded hosts, or content are read into metadata or logs.
export function requestSeo(url: URL, production: boolean) {
 const headers: Record<string, string> = {};
 const canonicalHost = url.origin === productionOrigin;
 const crawlerAsset = ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/favicon.svg', '/favicon.png', '/favicon-192.png', '/favicon-512.png', '/apple-touch-icon.png'].includes(url.pathname);
 if (!production || !canonicalHost || (!isPublicLocation(url) && !isPublicAttributionLocation(url) && !crawlerAsset)) headers['X-Robots-Tag'] = noindex;
 if (url.search) headers['Cache-Control'] = 'private, no-store';
 if (['resumestride.com', 'www.resumestride.com'].includes(url.hostname) &&
     (url.origin !== productionOrigin || url.pathname === '/index.html')) {
  return { status: 308, headers: { ...headers, Location: `${productionOrigin}${url.pathname === '/index.html' ? '/' : url.pathname}${url.search}` }, body: '' };
 }
 if (url.pathname === '/index.html') return { status: 308, headers: { ...headers, Location: `/${url.search}` }, body: '' };
 const asset = ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/favicon.svg', '/favicon.png', '/favicon-192.png', '/favicon-512.png', '/apple-touch-icon.png', '/social-card.png', '/site.webmanifest', '/seo-guard.js', '/resources.css', '/content-analytics.js', '/tools.css', '/tools/analysis.js', '/tools/public-tools.js', '/tools/tool-analytics.js'].includes(url.pathname);
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
