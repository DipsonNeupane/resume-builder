// Keep the production middleware entry self-contained. Vercel packages this file as
// its own runtime unit, so imports from the application source tree can be absent even
// though they resolve during local TypeScript execution.
export const productionOrigin = 'https://resumestride.com';
type PublicPageMetadata = { title: string; description: string; lastModified: `${number}-${number}-${number}`; socialImage: `/social/${string}.png` };
const publicRegistryReviewedOn = '2026-09-30' as const;
const page = (path: string, title: string, description: string, lastModified: PublicPageMetadata['lastModified']): PublicPageMetadata => ({
 title,
 description,
 lastModified: lastModified > publicRegistryReviewedOn ? lastModified : publicRegistryReviewedOn,
 socialImage: `/social/${path === '/' ? 'home' : path.replace(/^\//, '').replace(/\/$/, '').replaceAll('/', '-')}.png`,
});
const templateNames = {
 modern:'Modern',classic:'Classic',minimal:'Minimal',compact:'Compact',bold:'Bold',executive:'Executive',ledger:'Ledger',
 boardroom:'Boardroom',mandate:'Mandate',stackline:'Stackline',kernel:'Kernel',casebook:'Casebook',atelier:'Atelier',scholar:'Scholar',bench:'Bench',charter:'Charter',rounds:'Rounds',meridian:'Meridian',crossover:'Crossover',almanac:'Almanac',roster:'Roster',primer:'Primer',pyramid:'Pyramid',quartile:'Quartile',waypoint:'Waypoint',cadence:'Cadence',plainsong:'Plainsong',
} as const;
const templatePages = Object.fromEntries(Object.entries(templateNames).map(([id,name])=>{const path=`/templates/${id}/`;return[path,page(path,`${name} resume template | ResumeStride`,`Review the verified structure, typography and intended use of the ${name} resume template, then preview it with your own content before choosing access.`,'2026-09-29')]}));
export const publicPages = {
 '/': page('/','ResumeStride — Resume Builder, Job Match & Tailoring','Build a master resume, find relevant jobs, compare your evidence with each role, and create truthful job-specific versions without changing your original.','2026-09-29'),
 '/features/': page('/features/','How ResumeStride works: evidence before effort','See how ResumeStride connects job requirements, resume evidence, user decisions, safe job-specific versions and concrete export formats.','2026-09-30'),
 '/features/resume-builder/': page('/features/resume-builder/','Master resume builder with safe job-specific versions | ResumeStride','Build or import a master resume, keep it intact, and use separate job-specific versions when a role deserves tailoring.','2026-09-30'),
 '/features/job-match/': page('/features/job-match/','Job Match based on requirement-level resume evidence | ResumeStride','Compare each job requirement with resume evidence, preserve the employer’s source wording, and make your own decision about the role.','2026-09-30'),
 '/features/job-specific-resumes/': page('/features/job-specific-resumes/','Tailor a separate resume version for a specific job | ResumeStride','Create a separate resume version for a saved job, review grounded suggestions, and keep the master resume unchanged.','2026-09-30'),
 '/features/resume-exports/': page('/features/resume-exports/','Resume PDF and editable Word export policy | ResumeStride','Understand what ResumeStride PDF and Word exports preserve, the account boundary, and the documented download allowance.','2026-09-30'),
 '/resources/': page('/resources/','Resume resources: evidence-first job search guides | ResumeStride','Practical, evidence-first resume guides for comparing roles, deciding whether to apply and tailoring your resume without making things up.','2026-09-29'),
 '/resources/tailor-resume-to-job-description/': page('/resources/tailor-resume-to-job-description/','How to tailor a resume to a job description | ResumeStride','Tailor your resume by mapping the role’s real requirements to evidence you already have—without rewriting everything or adding unsupported claims.','2026-09-29'),
 '/resources/should-you-tailor-resume-for-every-job/': page('/resources/should-you-tailor-resume-for-every-job/','Should you tailor your resume for every job? | ResumeStride','Decide when a job deserves a fully tailored resume, a light role-family edit or no application at all—with a practical effort framework.','2026-09-29'),
 '/resources/compare-resume-to-job-description/': page('/resources/compare-resume-to-job-description/','How to compare your resume to a job description | ResumeStride','Compare a resume with a job description using a requirement-to-evidence table, not a misleading keyword percentage or interview prediction.','2026-09-29'),
 '/resources/how-to-know-if-qualified-for-job/': page('/resources/how-to-know-if-qualified-for-job/','How to know if you’re qualified for a job | ResumeStride','Evaluate job qualifications without arbitrary percentage rules: check eligibility, core work, evidence, transferable experience and genuine gaps.','2026-09-29'),
 '/resources/master-resume-vs-tailored-resume/': page('/resources/master-resume-vs-tailored-resume/','Master resume vs. tailored resume: what to keep in each | ResumeStride','Learn the difference between a complete master resume and a focused tailored resume, what belongs in each and how to keep versions organized.','2026-09-29'),
 '/resources/how-much-resume-should-change/': page('/resources/how-much-resume-should-change/','How much should your resume change for each job? | ResumeStride','Learn what to change, what to keep fixed and when a resume needs a light edit versus a deeper job-specific version.','2026-09-29'),
 '/resources/resume-keywords/': page('/resources/resume-keywords/','Resume keywords: what actually belongs in your resume | ResumeStride','Choose resume keywords that describe real skills, tools, methods and qualifications—and place them where your evidence supports them.','2026-09-29'),
 '/resources/tailor-resume-without-lying/': page('/resources/tailor-resume-without-lying/','How to tailor a resume without lying or making things up | ResumeStride','Tailor your resume honestly by clarifying, selecting and translating real experience—without inventing skills, titles, results or credentials.','2026-09-29'),
 '/resources/career-change-transferable-evidence/': page('/resources/career-change-transferable-evidence/','Transferable experience for a career change | ResumeStride','Map a new role’s real requirements to transferable evidence without renaming old jobs, overstating responsibility or hiding genuine gaps.','2026-09-30'),
 '/resources/choose-resume-template/': page('/resources/choose-resume-template/','How to choose a resume template | ResumeStride','Choose a resume template by content density, hierarchy, paper size and direction—not by unsupported claims about hiring or ATS success.','2026-09-30'),
 '/resources/a4-vs-letter-resume/': page('/resources/a4-vs-letter-resume/','A4 vs. Letter resume page size | ResumeStride','Choose A4 or Letter for a resume by following the application context, then verify pagination and export instead of relying on a universal country rule.','2026-09-30'),
 '/resources/resume-or-cv-by-country/': page('/resources/resume-or-cv-by-country/','Resume or CV by country: verify local expectations | ResumeStride','Check regional resume and CV expectations through official current sources while keeping employer instructions and occupation rules in control.','2026-09-30'),
 '/occupations/': page('/occupations/','Occupation research for evidence-first resumes | ResumeStride','Use occupation research to understand work and identify evidence—not to copy generic duties or assume one country’s requirements apply worldwide.','2026-09-30'),
 '/compare/': page('/compare/','Compare resume and job-search tools factually | ResumeStride','Compare resume and job-search tools using dated product facts: free output, billing, privacy, evidence method, version safety and user control.','2026-09-30'),
 '/tools/': page('/tools/','Free resume and job search tools | ResumeStride','Free, private resume and job-description tools: extract requirements, compare evidence and improve resume bullets without ATS scores or signup.','2026-09-29'),
 '/tools/job-requirement-extractor/': page('/tools/job-requirement-extractor/','Free job requirement extractor | ResumeStride','Extract required, preferred and other signals from a job description with source text you can verify. Free, private and no signup required.','2026-09-29'),
 '/tools/resume-job-match/': page('/tools/resume-job-match/','Compare your resume to a job description free | ResumeStride','Compare resume evidence with job requirements—clearly demonstrated, worth reviewing or not demonstrated. No ATS score, signup or upload.','2026-09-29'),
 '/tools/resume-bullet-checker/': page('/tools/resume-bullet-checker/','Free resume bullet point checker | ResumeStride','Check one resume bullet for action, specificity, context, evidence, readability and filler—without an ATS score or invented metrics.','2026-09-29'),
 '/templates/': page('/templates/','Resume templates: preview before choosing | ResumeStride','Browse all ResumeStride resume templates by verified structure, density and access tier. Preview any design with your own content before choosing it.','2026-09-29'),
 '/pricing/': page('/pricing/','ResumeStride pricing and template access','Compare ResumeStride Free, one Premium template and Pro with explicit recurring terms, cancellation behavior and PDF or Word export boundaries.','2026-09-30'),
 '/trust/': page('/trust/','How ResumeStride earns trust','Review factual ResumeStride boundaries for Match evidence, master-resume safety, template preview, exports, privacy and customer proof.','2026-09-30'),
 '/privacy.html': page('/privacy.html','Privacy notice | ResumeStride','Read how ResumeStride handles resume drafts, account information, document uploads, payments and optional AI processing, and how to contact support.','2026-09-24'),
 '/terms.html': page('/terms.html','Terms and refunds | ResumeStride','Read the ResumeStride terms of service, Pro purchase and renewal conditions, refund information, usage limits and support details.','2026-09-24'),
 ...templatePages,
} as const;
export const publicAnchors = new Set(['', '#how-it-works', '#templates', '#pricing', '#main-content']);
export type AppPage = 'home' | 'builder' | 'account' | 'pro' | 'jobs';
const privateAppPath = /^\/(?:start\/(?:import|build|job|sample)|workspace\/(?:resume|jobs(?:\/saved|\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/match)?|resumes\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|account|pro))\/?$/i;
export const privateMetadata = {
 builder: { title: 'Resume editor | ResumeStride', description: 'Edit and review your resume in your private workspace.' },
 account: { title: 'Account access | ResumeStride', description: 'Sign in, manage your account or recover access to ResumeStride.' },
 pro: { title: 'Pro options | ResumeStride', description: 'Review Pro options and manage your ResumeStride access.' },
 jobs: { title: 'Jobs and Match Analysis | ResumeStride', description: 'Review job opportunities, saved jobs and resume evidence in your account workspace.' },
};
export function isPublicPath(path: string): path is keyof typeof publicPages {
 return Object.hasOwn(publicPages, path);
}
export function isPrivateAppPath(path: string): boolean {
 return privateAppPath.test(path);
}
export function isPublicLocation(url: URL): boolean {
 return isPublicPath(url.pathname) && !url.search && isPublicAnchor(url.pathname, url.hash);
}
function isPublicAnchor(path: string, hash: string): boolean {
 return path.startsWith('/features/') || path.startsWith('/resources/') || path.startsWith('/tools/') || path.startsWith('/templates/') || path==='/occupations/' || path==='/compare/' || path==='/pricing/' || path==='/trust/' ? hash === '' || /^#[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hash) : publicAnchors.has(hash);
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
 if (/^\/workspace\/(?:account|pro)\/?$/i.test(url.pathname)) return url.pathname.toLowerCase().includes('/account') ? 'account' : 'pro';
 if (/^\/workspace\/(?:jobs(?:\/|$))|^\/start\/(?:job|sample)\/?$/i.test(url.pathname)) return 'jobs';
 if (/^\/workspace\/(?:resume|resumes\/)|^\/start\/(?:import|build)\/?$/i.test(url.pathname)) return 'builder';
 if (url.searchParams.has('jobs')) return 'jobs';
 if (url.searchParams.has('builder')) return 'builder';
 return url.searchParams.has('pro') ? 'pro' : 'home';
}
export const websiteSchema = {
 '@context': 'https://schema.org', '@type': 'WebSite',
 '@id': `${productionOrigin}/#website`, name: 'ResumeStride', url: `${productionOrigin}/`,
 description: publicPages['/'].description, inLanguage: 'en',
};
export function publicPageSchema(path: keyof typeof publicPages) {
 const details = publicPages[path];
 return {
  '@context': 'https://schema.org', '@type': 'WebPage',
  '@id': `${productionOrigin}${path}#webpage`, url: `${productionOrigin}${path}`,
  name: details.title, description: details.description, dateModified: details.lastModified,
  inLanguage: 'en', isPartOf: { '@id': `${productionOrigin}/#website` },
 };
}
export const noindex = 'noindex, nofollow, noarchive';
export const notFoundHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><title>Page not found | ResumeStride</title><link rel="icon" href="/favicon.ico" sizes="64x64"><link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any"><link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192"><style>body{margin:0;background:#0b0a09;color:#f4efe8;font:17px/1.7 system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:80px 22px}h1{font-size:48px;line-height:1;letter-spacing:-.02em}a{color:#f7ae74}</style></head><body><main><h1>Page not found</h1><p>This address does not have a ResumeStride page.</p><nav><a href="/">ResumeStride home</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms and refunds</a></nav></main></body></html>';

// Request policy shared by Vercel middleware and the local Vite adapter. No user
// identity, tokens, forwarded hosts, or content are read into metadata or logs.
export function requestSeo(url: URL, production: boolean) {
 const headers: Record<string, string> = {};
 const canonicalHost = url.origin === productionOrigin;
 const crawlerAsset = ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/favicon.svg', '/favicon.png', '/favicon-192.png', '/favicon-512.png', '/apple-touch-icon.png'].includes(url.pathname) || /^\/(?:fonts|social)\/[a-z0-9._-]+$/.test(url.pathname);
 if (!production || !canonicalHost || (!isPublicLocation(url) && !isPublicAttributionLocation(url) && !crawlerAsset)) headers['X-Robots-Tag'] = noindex;
 if (url.search) headers['Cache-Control'] = 'private, no-store';
 if (['resumestride.com', 'www.resumestride.com'].includes(url.hostname) &&
     (url.origin !== productionOrigin || url.pathname === '/index.html')) {
  return { status: 308, headers: { ...headers, Location: `${productionOrigin}${url.pathname === '/index.html' ? '/' : url.pathname}${url.search}` }, body: '' };
 }
 if (url.pathname === '/index.html') return { status: 308, headers: { ...headers, Location: `/${url.search}` }, body: '' };
 const asset = ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/favicon.svg', '/favicon.png', '/favicon-192.png', '/favicon-512.png', '/apple-touch-icon.png', '/social-card.png', '/site.webmanifest', '/seo-guard.js', '/resources.css', '/content-analytics.js', '/tools.css', '/tools/analysis.js', '/tools/public-tools.js', '/tools/tool-analytics.js', '/templates.css', '/templates-filter.js', '/features.css', '/fonts.css'].includes(url.pathname) || /^\/(?:fonts|social)\/[a-z0-9._-]+$/.test(url.pathname);
 const infrastructure = /^\/(?:api(?:\/|$)|assets\/|_vercel\/|\.well-known\/)/.test(url.pathname);
 // The extension fixture remains reachable for local installed-extension tests,
 // but must never be an indexable job page.
 const fixture = url.pathname.startsWith('/extension-fixture/');
 if (isPrivateAppPath(url.pathname)) return { status: 0, headers: { ...headers, 'X-Robots-Tag': noindex, 'Cache-Control': 'private, no-store' }, body: '' };
 if (!url.search) {
  if (/^\/assets\/[a-zA-Z0-9._-]+$/.test(url.pathname)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  else if (/^\/(?:fonts|social)\/[a-z0-9._-]+$/.test(url.pathname)) headers['Cache-Control'] = 'public, max-age=604800, stale-while-revalidate=2592000';
  else if (isPublicPath(url.pathname) || asset) headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
 }
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
