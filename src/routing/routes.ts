export type LegacyAppPage = 'home' | 'builder' | 'account' | 'pro' | 'jobs' | 'tracker';
export type EntryJourney = 'import_first' | 'build_first' | 'job_first' | 'sample';

export type AppRoute =
 | { kind: 'home'; path: '/' }
 | { kind: 'start_import'; path: '/start/import' }
 | { kind: 'start_build'; path: '/start/build' }
 | { kind: 'start_job'; path: '/start/job' }
 | { kind: 'start_sample'; path: '/start/sample' }
 | { kind: 'workspace_resume'; path: '/workspace/resume' }
 | { kind: 'workspace_today'; path: '/workspace/today' }
 | { kind: 'workspace_preferences'; path: '/workspace/preferences' }
 | { kind: 'workspace_jobs'; path: '/workspace/discover' }
 | { kind: 'workspace_applications'; path: '/workspace/applications' }
 | { kind: 'workspace_application'; path: string; savedJobId: string }
 | { kind: 'workspace_saved_jobs'; path: '/workspace/jobs/saved' }
 | { kind: 'workspace_match'; path: string; savedJobId: string }
 | { kind: 'workspace_job_resume'; path: string; versionId: string }
 | { kind: 'workspace_account'; path: '/workspace/account' }
 | { kind: 'workspace_pro'; path: '/workspace/pro' }
 | { kind: 'not_found'; path: string };

export type NavigableRoute = Exclude<AppRoute, { kind: 'not_found' }>;

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const matchPath = new RegExp(`^/workspace/jobs/(${uuid})/match$`, 'i');
const jobResumePath = new RegExp(`^/workspace/resumes/(${uuid})$`, 'i');
const applicationPath = new RegExp(`^/workspace/applications/(${uuid})$`, 'i');

const exactRoutes = new Map<string, NavigableRoute>([
 ['/', { kind: 'home', path: '/' }],
 ['/start/import', { kind: 'start_import', path: '/start/import' }],
 ['/start/build', { kind: 'start_build', path: '/start/build' }],
 ['/start/job', { kind: 'start_job', path: '/start/job' }],
 ['/start/sample', { kind: 'start_sample', path: '/start/sample' }],
 ['/workspace/resume', { kind: 'workspace_resume', path: '/workspace/resume' }],
 ['/workspace', { kind: 'workspace_today', path: '/workspace/today' }],
 ['/workspace/today', { kind: 'workspace_today', path: '/workspace/today' }],
 ['/workspace/preferences', { kind: 'workspace_preferences', path: '/workspace/preferences' }],
 ['/workspace/discover', { kind: 'workspace_jobs', path: '/workspace/discover' }],
 // Retained deep links: the old jobs and saved-jobs paths resolve to Discover and My applications.
 ['/workspace/jobs', { kind: 'workspace_jobs', path: '/workspace/discover' }],
 ['/workspace/applications', { kind: 'workspace_applications', path: '/workspace/applications' }],
 ['/workspace/jobs/saved', { kind: 'workspace_applications', path: '/workspace/applications' }],
 ['/workspace/account', { kind: 'workspace_account', path: '/workspace/account' }],
 ['/workspace/pro', { kind: 'workspace_pro', path: '/workspace/pro' }],
]);

function cleanPath(pathname: string): string {
 if (pathname === '/index.html') return '/';
 const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
 return path.toLowerCase();
}

export function parseAppRoute(location: Pick<Location, 'pathname' | 'search' | 'hash'> | URL): AppRoute {
 const path = cleanPath(location.pathname);
 if (isAccountCallback(location)) return { kind: 'workspace_account', path: '/workspace/account' };
 if (path === '/') {
  const params = new URLSearchParams(location.search);
  if (params.has('jobs')) return { kind: 'workspace_jobs', path: '/workspace/discover' };
  if (params.has('builder')) return { kind: 'workspace_resume', path: '/workspace/resume' };
  if (params.has('pro')) return { kind: 'workspace_pro', path: '/workspace/pro' };
 }
 const exact = exactRoutes.get(path);
 if (exact) return exact;
 const match = path.match(matchPath);
 if (match) return { kind: 'workspace_match', path, savedJobId: match[1].toLowerCase() };
 const application = path.match(applicationPath);
 if (application) return { kind: 'workspace_application', path, savedJobId: application[1].toLowerCase() };
 const version = path.match(jobResumePath);
 if (version) return { kind: 'workspace_job_resume', path, versionId: version[1].toLowerCase() };
 return { kind: 'not_found', path };
}

export function isAccountCallback(location: Pick<Location, 'search' | 'hash'> | URL): boolean {
 const params = new URLSearchParams(location.search);
 return ['account', 'reset', 'code', 'token', 'token_hash', 'error'].some(key => params.has(key)) ||
  /(?:access_token|refresh_token|type=recovery|error)=?/.test(location.hash);
}

export function routePage(route: AppRoute): LegacyAppPage | null {
 switch (route.kind) {
  case 'home': return 'home';
  case 'start_import': case 'start_build': case 'workspace_resume': case 'workspace_job_resume': return 'builder';
  case 'start_job': case 'start_sample': case 'workspace_jobs': case 'workspace_saved_jobs': case 'workspace_match': return 'jobs';
  case 'workspace_today': case 'workspace_applications': case 'workspace_application': case 'workspace_preferences': return 'tracker';
  case 'workspace_account': return 'account';
  case 'workspace_pro': return 'pro';
  case 'not_found': return null;
 }
}

export function routeForPage(page: LegacyAppPage): NavigableRoute {
 switch (page) {
  case 'home': return { kind: 'home', path: '/' };
  case 'builder': return { kind: 'workspace_resume', path: '/workspace/resume' };
  case 'jobs': return { kind: 'workspace_jobs', path: '/workspace/discover' };
  case 'tracker': return { kind: 'workspace_today', path: '/workspace/today' };
  case 'account': return { kind: 'workspace_account', path: '/workspace/account' };
  case 'pro': return { kind: 'workspace_pro', path: '/workspace/pro' };
 }
}

export function routeForJourney(journey: EntryJourney): NavigableRoute {
 switch (journey) {
  case 'import_first': return { kind: 'start_import', path: '/start/import' };
  case 'build_first': return { kind: 'start_build', path: '/start/build' };
  case 'job_first': return { kind: 'start_job', path: '/start/job' };
  case 'sample': return { kind: 'start_sample', path: '/start/sample' };
 }
}

export function journeyForRoute(route: AppRoute): EntryJourney | null {
 switch (route.kind) {
  case 'start_import': return 'import_first';
  case 'start_build': return 'build_first';
  case 'start_job': return 'job_first';
  case 'start_sample': return 'sample';
  default: return null;
 }
}

export function matchRoute(savedJobId: string): NavigableRoute {
 const route = parseAppRoute(new URL(`/workspace/jobs/${savedJobId}/match`, 'https://resumestride.invalid'));
 if (route.kind !== 'workspace_match') throw new Error('A valid saved-job identifier is required.');
 return route;
}

/** Saved jobs and applications are one list now; the old route name is kept for callers. */
export function savedJobsRoute(): NavigableRoute {
 return applicationsRoute();
}

export function todayRoute(): NavigableRoute {
 return { kind: 'workspace_today', path: '/workspace/today' };
}

export function preferencesRoute(): NavigableRoute {
 return { kind: 'workspace_preferences', path: '/workspace/preferences' };
}

export function applicationsRoute(): NavigableRoute {
 return { kind: 'workspace_applications', path: '/workspace/applications' };
}

export function applicationRoute(savedJobId: string): NavigableRoute {
 const route = parseAppRoute(new URL(`/workspace/applications/${savedJobId}`, 'https://resumestride.invalid'));
 if (route.kind !== 'workspace_application') throw new Error('A valid application identifier is required.');
 return route;
}

export function jobResumeRoute(versionId: string): NavigableRoute {
 const route = parseAppRoute(new URL(`/workspace/resumes/${versionId}`, 'https://resumestride.invalid'));
 if (route.kind !== 'workspace_job_resume') throw new Error('A valid job-resume identifier is required.');
 return route;
}

export const publicDestinations = {
 home: '/',
 features: '/features/',
 tools: '/tools/',
 resources: '/resources/',
 templates: '/templates/',
 pricing: '/pricing/',
 trust: '/trust/',
} as const;
