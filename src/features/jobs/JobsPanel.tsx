/** Local ResumeStride V1 job recommendation experience over the provider-neutral
 * Techmap foundation (server/jobs/*). This panel never talks to Techmap directly — it
 * always calls the authenticated, origin-checked /api/jobs-search route, which is the
 * only thing that ever forwards a bounded title/country/workplace to Techmap and never
 * forwards resume evidence, contact fields, or account PII.
 *
 * Ranking is entirely server-side and deterministic (Strong/Good/Stretch, no
 * percentages, no model-provider call); this component only renders whatever the
 * server already decided and never re-scores anything client-side.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../services/supabase';
import type { Resume } from '../../model';
import { buildResumeEvidence, proposeSearchesFromResume } from './evidence';
import { startAutoRefreshLoop } from './autoRefreshScheduler';
import { fingerprintResume, parseJobResumeSummaries, parseJobResumeVersion, type JobResumeVersion, type JobResumeVersionSummary } from '../../services/jobResumeVersions';

type Workplace = 'remote' | 'hybrid' | 'onsite' | 'field';
type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary' | 'internship';
type MatchLabel = 'strong' | 'good' | 'stretch';
type SalaryPeriod = 'hour' | 'year';
type Requirement = { id: string; text: string; category: 'required' | 'preferred' | 'nice_to_have'; status: 'demonstrated' | 'partially_demonstrated' | 'not_demonstrated' | 'confirmed_incompatible'; evidence: string[] };
type MatchAnalysis = {
  version: 1; label: MatchLabel; resumeHash: string; jobHash: string; contextHash: string;
  whyPromising: string; observations: string[]; importantWarning: string | null; seniorityMessage: string | null;
  additionalAreasAnalyzed: number; clarification?: { requirementId: string; text: string };
  fullAnalysis?: { requirements: Requirement[]; strengths: string[]; buriedEvidence: string[]; areasWorthStrengthening: string[]; constraints: string[]; deeperExplanation: string; tailoringAction: 'Tailor my resume for this job' };
};

type JobCard = {
  id: string;
  title: string;
  company: string;
  location: { city: string | null; region: string | null; country: string | null };
  workplace: Workplace | 'unknown';
  employmentType: EmploymentType | 'unknown';
  salary: { min: number; max: number; currency: string; period: SalaryPeriod } | null;
  postedAt: string | null;
  matchLabel: MatchLabel;
  matchReasons: string[];
  matchAnalysis?: MatchAnalysis;
  sourceUrl: string;
  savedSnapshot: SavedJobSnapshot;
};

type SavedJobSnapshot = Record<string, unknown> & {
  id: string; title: string; company: string; sourceUrl: string;
  location: { value: JobCard['location'] };
  workplace: { value: JobCard['workplace'] };
  employmentType: { value: JobCard['employmentType'] };
  salary: JobCard['salary']; matchLabel: MatchLabel; matchReasons: string[];
};

type SavedJob = {
  id: string; snapshot: SavedJobSnapshot; providerAvailable: boolean;
  availabilityCheckedAt: string; unavailableAt: string | null; savedAt: string;
  matchAnalysis?: MatchAnalysis | null; analysisCurrent?: boolean; analysisInvalidationReason?: string | null;
};

type Criteria = {
  title: string;
  countryCode?: string;
  location?: string;
  workplace?: Workplace;
  employmentType?: EmploymentType;
  salary?: { period: SalaryPeriod; currency: string; min?: number | null; max?: number | null };
};

type Props = { resume: Resume; ownerId: string | null; onSignIn: () => void; onViewPro: () => void; onBack: () => void; onEditJobResume: (version: JobResumeVersion, masterChanged: boolean) => void };

const WORKPLACE_VALUES: Workplace[] = ['remote', 'hybrid', 'onsite', 'field'];
const EMPLOYMENT_VALUES: EmploymentType[] = ['full_time', 'part_time', 'contract', 'temporary', 'internship'];
const MATCH_VALUES: MatchLabel[] = ['strong', 'good', 'stretch'];
const PERIOD_VALUES: SalaryPeriod[] = ['hour', 'year'];

const WORKPLACE_LABELS: Record<Workplace | 'unknown', string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite', field: 'Field-based', unknown: 'Workplace not listed' };
const EMPLOYMENT_LABELS: Record<EmploymentType | 'unknown', string> = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', temporary: 'Temporary', internship: 'Internship', unknown: 'Employment type not listed' };
const MATCH_LABELS: Record<MatchLabel, string> = { strong: 'Strong match', good: 'Good match', stretch: 'Stretch' };

const DAY_MS = 24 * 60 * 60 * 1000;

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object'; }

function formatLocation(location: JobCard['location']): string {
  const parts = [location.city, location.region, location.country].filter((part): part is string => !!part);
  return parts.length ? parts.join(', ') : 'Location not listed';
}

function formatSalary(salary: JobCard['salary']): string {
  if (!salary) return 'Salary not listed';
  return `${salary.currency} ${salary.min.toLocaleString()}–${salary.max.toLocaleString()} / ${salary.period === 'year' ? 'year' : 'hour'}`;
}

function formatRefreshTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function isValidLocation(value: unknown): value is JobCard['location'] {
  if (!record(value)) return false;
  const { city, region, country } = value;
  return (city === null || typeof city === 'string') && (region === null || typeof region === 'string') && (country === null || typeof country === 'string');
}

function isValidSalary(value: unknown): value is JobCard['salary'] {
  if (value === null) return true;
  if (!record(value)) return false;
  const { min, max, currency, period } = value;
  return typeof min === 'number' && Number.isFinite(min)
    && typeof max === 'number' && Number.isFinite(max) && min <= max
    && typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency)
    && typeof period === 'string' && PERIOD_VALUES.includes(period as SalaryPeriod);
}

const MAX_JOB_URL_CHARS = 2048;

// Mirrors server/jobs/url.ts's safeJobUrl exactly: this URL is untrusted server
// response data rendered as a live link, so the browser must independently enforce the
// same rules rather than trusting that the server already filtered it. Only an
// absolute https:// URL with a nonempty host and no embedded userinfo passes; anything
// else (javascript:, data:, relative paths, credentials in the URL, or an unreasonably
// long string) fails closed.
function isSafeJobUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_JOB_URL_CHARS) return false;
  let url: URL;
  try { url = new URL(trimmed); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (!url.hostname) return false;
  return true;
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseMatchAnalysis(value: unknown): MatchAnalysis | null {
  if (!record(value) || value.version !== 1 || typeof value.label !== 'string' || !MATCH_VALUES.includes(value.label as MatchLabel)
    || typeof value.resumeHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.resumeHash)
    || typeof value.jobHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.jobHash)
    || typeof value.contextHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.contextHash)
    || typeof value.whyPromising !== 'string' || value.whyPromising.length > 1000 || !Array.isArray(value.observations) || value.observations.length > 3
    || !value.observations.every(item => typeof item === 'string' && item.length <= 1000) || !isSafeCount(value.additionalAreasAnalyzed) || value.additionalAreasAnalyzed > 30
    || (value.importantWarning !== null && typeof value.importantWarning !== 'string')
    || (value.seniorityMessage !== null && typeof value.seniorityMessage !== 'string')) return null;
  if (value.clarification !== undefined && (!record(value.clarification)
    || typeof value.clarification.requirementId !== 'string' || !/^[0-9a-f]{16}$/.test(value.clarification.requirementId)
    || typeof value.clarification.text !== 'string' || value.clarification.text.length > 400)) return null;
  if (value.fullAnalysis !== undefined) {
    const full = value.fullAnalysis;
    const stringList = (item: unknown, limit: number) => Array.isArray(item) && item.length <= limit && item.every(text => typeof text === 'string' && text.length <= 1000);
    if (!record(full) || !Array.isArray(full.requirements) || full.requirements.length > 30
      || !full.requirements.every(item => record(item) && typeof item.id === 'string' && /^[0-9a-f]{16}$/.test(item.id)
        && typeof item.text === 'string' && item.text.length <= 400
        && ['required', 'preferred', 'nice_to_have'].includes(String(item.category))
        && ['demonstrated', 'partially_demonstrated', 'not_demonstrated', 'confirmed_incompatible'].includes(String(item.status))
        && stringList(item.evidence, 5))
      || !stringList(full.strengths, 10) || !stringList(full.buriedEvidence, 10)
      || !stringList(full.areasWorthStrengthening, 10) || !stringList(full.constraints, 10)
      || typeof full.deeperExplanation !== 'string' || full.deeperExplanation.length > 2000
      || full.tailoringAction !== 'Tailor my resume for this job') return null;
  }
  return value as unknown as MatchAnalysis;
}

// Every field here is untrusted server response data; any entry that doesn't fully
// match the expected shape is dropped rather than rendered, so a malformed or hostile
// record can never crash the panel or produce a misleading card.
function parseJobCard(item: unknown): JobCard | null {
  if (!record(item)) return null;
  if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.company !== 'string') return null;
  if (!isValidLocation(item.location)) return null;
  if (typeof item.workplace !== 'string' || !(WORKPLACE_VALUES as string[]).concat('unknown').includes(item.workplace)) return null;
  if (typeof item.employmentType !== 'string' || !(EMPLOYMENT_VALUES as string[]).concat('unknown').includes(item.employmentType)) return null;
  if (!isValidSalary(item.salary)) return null;
  if (item.postedAt !== null && typeof item.postedAt !== 'string') return null;
  if (typeof item.matchLabel !== 'string' || !MATCH_VALUES.includes(item.matchLabel as MatchLabel)) return null;
  if (!Array.isArray(item.matchReasons) || !item.matchReasons.every(reason => typeof reason === 'string')) return null;
  if (!isSafeJobUrl(item.sourceUrl)) return null;
  if (!record(item.savedSnapshot)) return null;
  const parsed = item as unknown as JobCard;
  if (item.matchAnalysis !== undefined) {
    const analysis = parseMatchAnalysis(item.matchAnalysis);
    if (!analysis) return null;
    parsed.matchAnalysis = analysis;
  }
  return parsed;
}

function parseSavedJobs(value: unknown): SavedJob[] {
  if (!Array.isArray(value)) throw new Error('Saved jobs returned an unusable response.');
  return value.flatMap(item => {
    if (!record(item) || typeof item.id !== 'string' || !record(item.snapshot)
      || typeof item.snapshot.id !== 'string' || typeof item.snapshot.title !== 'string'
      || typeof item.snapshot.company !== 'string' || !isSafeJobUrl(item.snapshot.sourceUrl)
      || typeof item.providerAvailable !== 'boolean' || typeof item.availabilityCheckedAt !== 'string'
      || (item.unavailableAt !== null && typeof item.unavailableAt !== 'string') || typeof item.savedAt !== 'string') return [];
    const saved = item as unknown as SavedJob;
    if (item.matchAnalysis != null) saved.matchAnalysis = parseMatchAnalysis(item.matchAnalysis);
    return [saved];
  });
}

function parseJobCards(body: unknown): { jobs: JobCard[]; isPro: boolean; availableCount: number; proLimit: number } {
  if (!record(body) || !Array.isArray(body.jobs) || typeof body.isPro !== 'boolean' || !isSafeCount(body.availableCount) || !isSafeCount(body.proLimit)) {
    throw new Error('Job search returned an unusable response.');
  }
  const jobs: JobCard[] = [];
  for (const item of body.jobs) {
    const parsed = parseJobCard(item);
    if (parsed) jobs.push(parsed);
  }
  return { jobs, isPro: body.isPro, availableCount: body.availableCount, proLimit: body.proLimit };
}

const CATEGORY_LABELS = { required: 'Required', preferred: 'Preferred', nice_to_have: 'Nice to have' } as const;
const STATUS_LABELS = { demonstrated: 'Clearly demonstrated', partially_demonstrated: 'Partially demonstrated', not_demonstrated: 'Not demonstrated', confirmed_incompatible: 'Confirmed incompatibility' } as const;

function MatchAnalysisPanel({ analysis, isPro, onViewPro, onClarify, jobTitle }: { jobTitle: string; analysis: MatchAnalysis; isPro: boolean; onViewPro: () => void; onClarify: (id: string, value: 'demonstrated'|'not_have'|'unsure') => void }) {
  const full = analysis.fullAnalysis;
  return <section className="match-analysis" role="group" aria-label={`Match analysis — ${jobTitle}`}>
    <div className="match-analysis-header"><h3>What your resume shows</h3><span>Resume evidence · Match Analysis</span></div>
    <p>{analysis.whyPromising}</p><p className="field-hint">Based only on what your resume shows, not a prediction of hiring. “Not demonstrated” doesn’t mean you don’t have it.</p>
    <ul>{analysis.observations.slice(0, 3).map((item, index) => <li key={index}>{item}</li>)}</ul>
    {analysis.importantWarning && <div className="match-warning" role="note"><strong>Important requirement</strong><span>{analysis.importantWarning}</span></div>}
    {analysis.seniorityMessage && <p className="match-seniority">{analysis.seniorityMessage}</p>}
    {analysis.clarification && <fieldset className="match-clarification">
      <legend>Help ResumeStride understand this requirement</legend>
      <span>{analysis.clarification.text}</span>
      <div><button className="text-button" onClick={() => onClarify(analysis.clarification!.requirementId, 'demonstrated')}>I can demonstrate this</button><button className="text-button" onClick={() => onClarify(analysis.clarification!.requirementId, 'not_have')}>I don’t have this</button><button className="text-button" onClick={() => onClarify(analysis.clarification!.requirementId, 'unsure')}>Not sure</button></div>
    </fieldset>}
    {!isPro && <div className="match-upgrade">
      {analysis.additionalAreasAnalyzed > 0 && <span>{analysis.additionalAreasAnalyzed} additional {analysis.additionalAreasAnalyzed === 1 ? 'area' : 'areas'} analyzed</span>}
      <button className="text-button" onClick={onViewPro}>View the full evidence analysis with Pro</button>
    </div>}
    {isPro && full && <details className="match-details"><summary>Full evidence analysis</summary>
      <p>{full.deeperExplanation}</p>
      <div className="match-requirements">{full.requirements.map(req => <article key={req.id}>
        <div><span className={`requirement-category requirement-${req.category}`}>{CATEGORY_LABELS[req.category]}</span><span className={`requirement-status status-${req.status}`}>{STATUS_LABELS[req.status]}</span></div>
        <p>{req.text}</p>{req.evidence.map((item, index) => <small key={index}>{item}</small>)}
      </article>)}</div>
      {full.strengths.length > 0 && <><h4>Strengths</h4><ul>{full.strengths.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
      {full.buriedEvidence.length > 0 && <><h4>Relevant experience that may be buried</h4><ul>{full.buriedEvidence.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
      {full.areasWorthStrengthening.length > 0 && <><h4>Areas worth strengthening</h4><ul>{full.areasWorthStrengthening.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
      {full.constraints.length > 0 && <><h4>Important constraints</h4><ul>{full.constraints.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
      <p className="field-hint">Save this job to start a separate job-specific resume. Your master resume stays unchanged, and no AI suggestion is applied without your review.</p>
    </details>}
  </section>;
}

export function JobsPanel({ resume, ownerId, onSignIn, onViewPro, onBack, onEditJobResume }: Props) {
  const [mode, setMode] = useState<'resume' | 'explicit'>('resume');
  const proposals = useMemo(() => proposeSearchesFromResume(resume), [resume]);
  const [title, setTitle] = useState(proposals[0]?.title ?? '');
  const [countryCode, setCountryCode] = useState('');
  const [location, setLocation] = useState('');
  const [workplace, setWorkplace] = useState<Workplace | ''>('');
  const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('');
  const [salaryPeriod, setSalaryPeriod] = useState<SalaryPeriod | ''>('');
  const [salaryCurrency, setSalaryCurrency] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<{ jobs: JobCard[]; isPro: boolean; availableCount: number; proLimit: number } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [saveLimit, setSaveLimit] = useState(3);
  const [accountIsPro, setAccountIsPro] = useState(false);
  const [accountLoaded, setAccountLoaded] = useState(false);
  const [nextFreeRefreshAt, setNextFreeRefreshAt] = useState(0);
  const [jobResumeVersions, setJobResumeVersions] = useState<JobResumeVersionSummary[]>([]);
  const inFlight = useRef(false);
  const active = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const lastCriteriaRef = useRef<Criteria | null>(null);
  const lastProviderRefreshRef = useRef(0);
  const currentOwnerRef = useRef(ownerId);
  currentOwnerRef.current = ownerId;

  async function accountRequest(action: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!supabase || !ownerId) throw new Error('Please sign in again and retry.');
    const session = await supabase.auth.getSession();
    if (session.data.session?.user.id !== ownerId) throw new Error('Please sign in again and retry.');
    const response = await fetch('/api/jobs-account', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.session.access_token}` },
      body: JSON.stringify(action), signal,
    });
    let body: unknown;
    try { body = await response.json(); } catch { throw new Error('Saved jobs returned an unusable response.'); }
    if (!response.ok) throw new Error(record(body) && typeof body.error === 'string' ? body.error : 'Saved jobs are temporarily unavailable.');
    if (!record(body)) throw new Error('Saved jobs returned an unusable response.');
    return body;
  }

  function applyCriteria(criteria: Criteria) {
    setTitle(criteria.title);
    setCountryCode(criteria.countryCode ?? '');
    setLocation(criteria.location ?? '');
    setWorkplace(criteria.workplace ?? '');
    setEmploymentType(criteria.employmentType ?? '');
    setSalaryPeriod(criteria.salary?.period ?? '');
    setSalaryCurrency(criteria.salary?.currency ?? '');
    setSalaryMin(criteria.salary?.min == null ? '' : String(criteria.salary.min));
    setSalaryMax(criteria.salary?.max == null ? '' : String(criteria.salary.max));
  }

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    setAutoRefresh(false);
    setSavedJobs([]);
    setJobResumeVersions([]);
    setSaveLimit(3);
    setAccountIsPro(false);
    setAccountLoaded(false);
    setNextFreeRefreshAt(0);
    lastProviderRefreshRef.current = 0;
    lastCriteriaRef.current = null;
    if (ownerId) void accountRequest({ action: 'load', evidence: buildResumeEvidence(resume) }, controller.signal).then(body => {
      if (controller.signal.aborted) return;
      const preferences = body.preferences;
      if (!record(preferences) || typeof preferences.autoRefresh !== 'boolean'
        || typeof body.isPro !== 'boolean' || typeof body.saveLimit !== 'number') throw new Error('Saved jobs returned an unusable response.');
      const criteria = preferences.criteria === null ? null : preferences.criteria as Criteria;
      setSavedJobs(parseSavedJobs(body.savedJobs));
      setJobResumeVersions(parseJobResumeSummaries(body.jobResumeVersions ?? []));
      setSaveLimit(body.saveLimit);
      setAccountIsPro(body.isPro);
      setAccountLoaded(true);
      setAutoRefresh(preferences.autoRefresh);
      lastCriteriaRef.current = criteria;
      lastProviderRefreshRef.current = typeof preferences.lastProviderRefreshAt === 'string' ? Date.parse(preferences.lastProviderRefreshAt) : 0;
      setNextFreeRefreshAt(body.isPro || !lastProviderRefreshRef.current ? 0 : lastProviderRefreshRef.current + DAY_MS);
      if (criteria && typeof criteria.title === 'string') applyCriteria(criteria);
    }).catch(error => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Saved jobs are temporarily unavailable.');
    });
    return () => { active.current = false; controller.abort(); controllerRef.current?.abort(); };
    // accountRequest intentionally resolves the currently verified owner each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (accountIsPro || !nextFreeRefreshAt) return;
    const remaining = nextFreeRefreshAt - Date.now();
    if (remaining <= 0) { setNextFreeRefreshAt(0); return; }
    const timer = window.setTimeout(() => setNextFreeRefreshAt(0), Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [accountIsPro, nextFreeRefreshAt]);

  function buildCriteria(): Criteria | null {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setMessage('Enter a job title or role to search.'); return null; }
    const criteria: Criteria = { title: trimmedTitle };
    if (countryCode.trim()) {
      if (!/^[A-Za-z]{2}$/.test(countryCode.trim())) { setMessage('Country should be a 2-letter code, e.g. US, GB, IN.'); return null; }
      criteria.countryCode = countryCode.trim().toUpperCase();
    }
    if (location.trim()) criteria.location = location.trim();
    if (workplace) criteria.workplace = workplace;
    if (employmentType) criteria.employmentType = employmentType;
    if (salaryPeriod) {
      if (!salaryCurrency.trim() || !/^[A-Za-z]{3}$/.test(salaryCurrency.trim())) { setMessage('Enter a 3-letter salary currency code, e.g. USD, EUR, INR.'); return null; }
      const minTrimmed = salaryMin.trim();
      const maxTrimmed = salaryMax.trim();
      const min = minTrimmed ? Number(minTrimmed) : undefined;
      const max = maxTrimmed ? Number(maxTrimmed) : undefined;
      if (min === undefined && max === undefined) { setMessage('Enter a minimum and/or maximum salary amount.'); return null; }
      if (min !== undefined && (!Number.isFinite(min) || min <= 0)) { setMessage('Enter a valid minimum salary amount.'); return null; }
      if (max !== undefined && (!Number.isFinite(max) || max <= 0)) { setMessage('Enter a valid maximum salary amount.'); return null; }
      if (min !== undefined && max !== undefined && min > max) { setMessage('Minimum salary cannot be greater than maximum salary.'); return null; }
      criteria.salary = { period: salaryPeriod, currency: salaryCurrency.trim().toUpperCase(), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
    }
    return criteria;
  }

  async function runSearch(criteria: Criteria) {
    if (inFlight.current || !supabase || !ownerId) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const session = await supabase.auth.getSession();
      if (session.data.session?.user.id !== ownerId) throw new Error('Please sign in again and retry.');
      const response = await fetch('/api/jobs-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.session.access_token}` },
        body: JSON.stringify({ criteria, evidence: buildResumeEvidence(resume) }),
        signal: controller.signal,
      });
      let body: unknown;
      try { body = await response.json(); } catch { throw new Error('Job search returned an unusable response.'); }
      if (!response.ok) {
        if (record(body) && typeof body.retryAt === 'string') {
          const retryAt = Date.parse(body.retryAt);
          if (!Number.isNaN(retryAt)) setNextFreeRefreshAt(retryAt);
        }
        const text = record(body) && typeof body.error === 'string' ? body.error : 'Job search is temporarily unavailable.';
        throw new Error(text);
      }
      if (!active.current || controller.signal.aborted) return;
      const parsed = parseJobCards(body);
      setResults(parsed);
      setAccountIsPro(parsed.isPro);
      lastCriteriaRef.current = criteria;
      const now = Date.now();
      lastProviderRefreshRef.current = now;
      const serverNextRefreshAt = record(body) && typeof body.nextRefreshAt === 'string' ? Date.parse(body.nextRefreshAt) : Number.NaN;
      setNextFreeRefreshAt(parsed.isPro ? 0 : Number.isNaN(serverNextRefreshAt) ? now + DAY_MS : serverNextRefreshAt);
      try { await accountRequest({ action: 'preferences', criteria, autoRefresh }); }
      catch { setMessage('Jobs loaded, but your search preferences could not be saved.'); }
      if (parsed.jobs.length === 0) setMessage('No matching jobs for this search yet. Try a broader title or location.');
    } catch (error) {
      if (controller.signal.aborted || !active.current) return;
      setMessage(error instanceof Error ? error.message : 'Job search is temporarily unavailable.');
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  function search() {
    const criteria = buildCriteria();
    if (criteria) void runSearch(criteria);
  }

  function refresh() {
    if (lastCriteriaRef.current) void runSearch(lastCriteriaRef.current);
    else search();
  }

  async function toggleAutoRefresh(next: boolean) {
    if (!ownerId) return;
    const requestedOwner = ownerId;
    setAutoRefresh(next);
    try {
      await accountRequest({ action: 'preferences', criteria: lastCriteriaRef.current, autoRefresh: next });
      if (currentOwnerRef.current !== requestedOwner) return;
      setMessage(next ? (accountIsPro ? 'Auto Refresh is on for a daily background update. You can still refresh manually as needed.' : 'Auto Refresh is on. Free recommendations refresh once a day.') : 'Auto Refresh is off.');
    } catch (error) {
      if (currentOwnerRef.current !== requestedOwner) return;
      setAutoRefresh(!next);
      setMessage(error instanceof Error ? error.message : 'Unable to save Auto Refresh preference.');
    }
  }

  async function saveJob(job: JobCard) {
    const requestedOwner = ownerId;
    try {
      await accountRequest({ action: 'save', job: job.savedSnapshot, evidence: buildResumeEvidence(resume), criteria: lastCriteriaRef.current });
      const body = await accountRequest({ action: 'load', evidence: buildResumeEvidence(resume) });
      if (currentOwnerRef.current !== requestedOwner) return;
      setSavedJobs(parseSavedJobs(body.savedJobs));
      setMessage('Job saved. Its Match Analysis is in Saved jobs.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save this job.'); }
  }

  async function refreshSavedAnalysis(savedJobId: string) {
    const requestedOwner = ownerId;
    try {
      const body = await accountRequest({ action: 'reanalyze', savedJobId, evidence: buildResumeEvidence(resume) });
      const analysis = parseMatchAnalysis(body.matchAnalysis);
      if (!analysis) throw new Error('Saved analysis returned an unusable response.');
      if (currentOwnerRef.current !== requestedOwner) return;
      setSavedJobs(current => current.map(saved => saved.id === savedJobId
        ? { ...saved, matchAnalysis: analysis, analysisCurrent: true, analysisInvalidationReason: null }
        : saved));
      setMessage('Match Analysis updated for your current resume. This didn’t use a job search.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to refresh this saved analysis.'); }
  }

  async function clarify(requirementId: string, value: 'demonstrated' | 'not_have' | 'unsure', target: { job?: JobCard; savedJobId?: string }) {
    const requestedOwner = ownerId;
    try {
      const body = await accountRequest({
        action: 'clarification', requirementId, value, evidence: buildResumeEvidence(resume),
        ...(target.savedJobId ? { savedJobId: target.savedJobId } : { job: target.job?.savedSnapshot, criteria: lastCriteriaRef.current }),
      });
      const analysis = parseMatchAnalysis(body.matchAnalysis);
      if (!analysis) throw new Error('Updated analysis returned an unusable response.');
      if (currentOwnerRef.current !== requestedOwner) return;
      if (target.savedJobId) {
        setSavedJobs(current => current.map(saved => saved.id === target.savedJobId
          ? { ...saved, matchAnalysis: analysis, analysisCurrent: true, analysisInvalidationReason: null }
          : saved));
      } else if (target.job) {
        setResults(current => current ? { ...current, jobs: current.jobs.map(job => job.id === target.job!.id
          ? { ...job, matchLabel: analysis.label, matchAnalysis: analysis }
          : job) } : current);
      }
      setMessage('Thanks. Match Analysis updated with your answer. This didn’t use a job search.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save this clarification.'); }
  }

  async function removeSavedJob(savedJobId: string) {
    const requestedOwner = ownerId;
    try {
      await accountRequest({ action: 'remove', savedJobId });
      if (currentOwnerRef.current !== requestedOwner) return;
      setSavedJobs(current => current.filter(job => job.id !== savedJobId));
      setJobResumeVersions(current => current.map(version => version.savedJobId === savedJobId ? { ...version, savedJobExists: false } : version));
      setMessage('Saved job removed. Any job-specific resume for it is kept.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to remove this saved job.'); }
  }

  async function openJobResume(summary: JobResumeVersionSummary) {
    if (!ownerId) return;
    const requestedOwner = ownerId;
    try {
      const body = await accountRequest({ action: 'get_job_resume', versionId: summary.id });
      const version = parseJobResumeVersion(body.version);
      const masterChanged = version.sourceMasterFingerprint !== await fingerprintResume(resume);
      if (currentOwnerRef.current !== requestedOwner) return;
      onEditJobResume(version, masterChanged);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load this job-specific resume.'); }
  }

  async function startTailoring(saved: SavedJob) {
    if (!ownerId) return;
    const existing = jobResumeVersions.find(version => version.savedJobId === saved.id);
    if (existing) { await openJobResume(existing); return; }
    if (!accountIsPro) { onViewPro(); return; }
    const requestedOwner = ownerId;
    try {
      const body = await accountRequest({ action: 'create_job_resume', savedJobId: saved.id, resume });
      const version = parseJobResumeVersion(body.version);
      if (currentOwnerRef.current !== requestedOwner) return;
      setJobResumeVersions(current => current.some(item => item.id === version.id) ? current : [{ ...version, savedJobExists: true }, ...current]);
      onEditJobResume(version, false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to start tailoring.'); }
  }

  // While the toggle is on and the panel stays mounted, actively schedules the next
  // search for whatever time remains in the 24-hour cadence — it does not just check
  // once on mount/toggle. Each run replays the last successful search's own criteria
  // rather than silently inventing a new one, and reads only this account's own scoped
  // storage keys. The loop is torn down (its timer cancelled) whenever autoRefresh
  // turns off, the account changes, or the panel unmounts.
  useEffect(() => {
    if (!autoRefresh || !ownerId) return;
    const handle = startAutoRefreshLoop({
      cadenceMs: DAY_MS,
      isInFlight: () => inFlight.current,
      getLastFetchedAt: () => {
        return lastProviderRefreshRef.current;
      },
      runRefresh: () => {
        const storedCriteria = lastCriteriaRef.current;
        if (storedCriteria) void runSearch(storedCriteria);
      },
    });
    return () => handle.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, ownerId]);

  const freeRefreshBlocked = !accountIsPro && nextFreeRefreshAt > Date.now();

  if (!ownerId) {
    return <section className="field jobs-panel" aria-label="Job search">
      <div className="jobs-panel-heading">
        <div><span className="section-label">Your opportunity workspace</span><h1>Find jobs</h1><p>Opportunities sourced across 190+ job portals and employer career sites. See what each role asks for, and what your resume already shows.</p></div>
        <button className="back-link" onClick={onBack}>Back</button>
      </div>
      <div className="notice" role="status">
        Sign in to search for jobs based on your resume. Save opportunities, understand the match, and return when you’re ready to apply. A free account includes one search every 24 hours, with up to 5 results.
        <button className="text-button" onClick={onSignIn}>Sign in or create account</button>
      </div>
    </section>;
  }

  return <section className="field jobs-panel" aria-label="Job search">
    <div className="jobs-panel-heading">
      <div><span className="section-label">Your opportunity workspace</span><h1>Find jobs</h1><p>Opportunities sourced across 190+ job portals and employer career sites. See what each role asks for, and what your resume already shows.</p></div>
      <button className="back-link" onClick={onBack}>Back</button>
    </div>
    <div className="opportunity-desk"><aside className="opportunity-search" aria-label="Search preferences"><h2>Find your next fit</h2>
    <div className="jobs-mode-toggle" role="radiogroup" aria-label="Job search mode">
      <label className={`jobs-mode-option ${mode === 'resume' ? 'active' : ''}`}>
        <input type="radio" name="jobs-mode" value="resume" checked={mode === 'resume'} onChange={() => setMode('resume')} />
        From your resume
      </label>
      <label className={`jobs-mode-option ${mode === 'explicit' ? 'active' : ''}`}>
        <input type="radio" name="jobs-mode" value="explicit" checked={mode === 'explicit'} onChange={() => setMode('explicit')} />
        Enter criteria
      </label>
    </div>

    {mode === 'resume' && proposals.length > 0 && <div className="jobs-proposals" role="group" aria-label="Suggested searches from your resume">
      {proposals.map(proposal => <button key={proposal.title} className={`text-button jobs-proposal-chip ${title === proposal.title ? 'active' : ''}`} onClick={() => setTitle(proposal.title)}>{proposal.label}</button>)}
    </div>}

    <div className="field-grid">
      <div className="field"><label htmlFor="jobs-title">Job title or role</label><input name="jobs-title" autoComplete="off" id="jobs-title" value={title} maxLength={200} placeholder="e.g. Product Manager" onChange={event => setTitle(event.target.value)} /></div>
      <div className="field"><label htmlFor="jobs-country">Country (optional)</label><input name="jobs-country" autoComplete="off" id="jobs-country" value={countryCode} maxLength={2} placeholder="e.g. US" onChange={event => setCountryCode(event.target.value.replace(/[^A-Za-z]/g, ''))} /></div>
      <div className="field"><label htmlFor="jobs-location">City or region (optional)</label><input name="jobs-location" autoComplete="off" id="jobs-location" value={location} maxLength={200} placeholder="e.g. Bengaluru or Greater Manchester" onChange={event => setLocation(event.target.value)} /></div>
      <div className="field"><label htmlFor="jobs-workplace">Workplace</label><select name="jobs-workplace" id="jobs-workplace" value={workplace} onChange={event => setWorkplace(event.target.value as Workplace | '')}><option value="">No preference</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">Onsite</option><option value="field">Field-based</option></select></div>
      <div className="field"><label htmlFor="jobs-employment-type">Employment type</label><select name="jobs-employment-type" id="jobs-employment-type" value={employmentType} onChange={event => setEmploymentType(event.target.value as EmploymentType | '')}><option value="">No preference</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="internship">Internship</option></select></div>
      <div className="field"><label htmlFor="jobs-salary-period">Salary</label><select name="jobs-salary-period" id="jobs-salary-period" value={salaryPeriod} onChange={event => setSalaryPeriod(event.target.value as SalaryPeriod | '')}><option value="">No preference</option><option value="year">Annual</option><option value="hour">Hourly</option></select></div>
      {salaryPeriod && <>
        <div className="field"><label htmlFor="jobs-salary-currency">Currency</label><input name="jobs-salary-currency" autoComplete="off" id="jobs-salary-currency" value={salaryCurrency} maxLength={3} placeholder="e.g. USD" onChange={event => setSalaryCurrency(event.target.value.replace(/[^A-Za-z]/g, ''))} /></div>
        <div className="field"><label htmlFor="jobs-salary-min">Minimum {salaryPeriod === 'year' ? 'annual' : 'hourly'} salary (optional)</label><input name="jobs-salary-min" autoComplete="off" id="jobs-salary-min" type="number" min={0} value={salaryMin} onChange={event => setSalaryMin(event.target.value)} /></div>
        <div className="field"><label htmlFor="jobs-salary-max">Maximum {salaryPeriod === 'year' ? 'annual' : 'hourly'} salary (optional)</label><input name="jobs-salary-max" autoComplete="off" id="jobs-salary-max" type="number" min={0} value={salaryMax} onChange={event => setSalaryMax(event.target.value)} /></div>
      </>}
    </div>
    <p className="field-hint">
      {salaryPeriod
        ? `Comparing ${salaryPeriod === 'year' ? 'annual' : 'hourly'} salary only against postings listing an amount in the exact same currency and period; jobs with an unlisted or differently formatted salary stay eligible.`
        : 'No salary preference set — jobs with any salary, or none listed, stay eligible.'}
    </p>
    {accountLoaded && !accountIsPro && !freeRefreshBlocked && <p className="field-hint">Free accounts get one search every 24 hours, with up to 5 results. Set your criteria first.</p>}
    <button className="button" disabled={busy || freeRefreshBlocked} onClick={search}><Search size={16} />{busy ? 'Searching…' : 'Search jobs'}</button>
    {freeRefreshBlocked && <p className="field-hint" role="status">Free recommendations can refresh again {formatRefreshTime(nextFreeRefreshAt)}. Your current results and saved jobs stay available. Pro has no once-a-day limit. <button className="text-button" onClick={onViewPro}>View Pro options</button></p>}

    <div className="jobs-toolbar">
      {results && <button className="text-button" disabled={busy || freeRefreshBlocked} onClick={refresh}><RefreshCw size={14} />Refresh</button>}
      <label className="jobs-auto-refresh"><input type="checkbox" checked={autoRefresh} onChange={event => void toggleAutoRefresh(event.target.checked)} />{accountIsPro ? 'Auto Refresh (daily background update)' : 'Auto Refresh (once a day)'}</label>
    </div>

    </aside><div className="opportunity-content">
    {message && <p role="status" className="field-hint">{message}</p>}
    {busy && <div className="jobs-skeleton" role="status"><strong>Looking for opportunities…</strong><span aria-hidden="true"/><span aria-hidden="true"/><p className="field-hint">Checking each role against your preferences and the evidence in your resume.</p></div>}
    {!results && !busy && savedJobs.length === 0 && <div className="empty-state"><strong>Your experience is the starting point.</strong><p>Choose a suggested role or enter your own criteria, then search. You’ll see why each opportunity may fit before deciding what to save.</p></div>}

    <section className="saved-jobs-section" aria-labelledby="saved-jobs-heading">
      <div className="saved-jobs-heading"><h2 id="saved-jobs-heading">Saved jobs</h2><span>{savedJobs.length}{accountIsPro ? '' : ` of ${saveLimit}`}</span></div>
      {savedJobs.length === 0 ? <div className="empty-state"><strong>Keep the roles worth a second look.</strong><p>Choose “Save job” on a result to keep it and its match evidence here, even if the listing closes{accountIsPro ? ' or your Pro access ends' : ''}.{accountIsPro ? '' : ` Free accounts can save up to ${saveLimit}.`}</p></div> :
        <ul className="jobs-results" aria-label="Saved jobs">{savedJobs.map(saved => {
          const job = saved.snapshot;
          return <li className="job-card saved-job-card" key={saved.id}>
            <div className="job-card-heading"><div><h3>{job.title}</h3><span>{job.company}</span></div>
              {!saved.providerAvailable && <span className="job-unavailable">No longer available</span>}
            </div>
            <div className="saved-job-state"><span>{saved.matchAnalysis ? 'Match Analysis available' : 'Match evidence pending'}</span><span>{jobResumeVersions.some(version => version.savedJobId === saved.id) ? 'Tailored resume saved' : 'Master resume unchanged'}</span></div>
            {job.provider === 'extension' && <>
              <p className="field-hint">Captured job · Availability not verified</p>
              <details><summary>View captured job details</summary>
                <p>{typeof job.portal === 'string' ? job.portal : 'User-reviewed capture'}</p>
                <pre className="job-description-text">{typeof job.descriptionText === 'string' ? job.descriptionText : ''}</pre>
                {record(job.capture) && record(job.capture.original) && typeof job.capture.original.description === 'string' && <details>
                  <summary>Original captured description before edits</summary><pre className="job-description-text">{job.capture.original.description}</pre>
                </details>}
              </details>
            </>}
            {saved.analysisCurrent === false && <p className="match-stale" role="status">Saved match analysis needs refreshing because the resume, job, preferences, or clarifications changed.</p>}
            {saved.analysisCurrent === false && <button className="text-button" onClick={() => void refreshSavedAnalysis(saved.id)}>Refresh match analysis</button>}
            {saved.analysisCurrent !== false && saved.matchAnalysis && <MatchAnalysisPanel jobTitle={`Saved: ${job.title} at ${job.company}`} analysis={saved.matchAnalysis} isPro={accountIsPro} onViewPro={onViewPro} onClarify={(id, value) => void clarify(id, value, { savedJobId: saved.id })} />}
            <div className="job-card-actions">
              <button className="button" onClick={() => void startTailoring(saved)}>
                {jobResumeVersions.some(version => version.savedJobId === saved.id) ? 'Open tailored resume' : accountIsPro ? 'Tailor my resume for this job' : 'Tailor my resume with Pro'}
              </button>
              {saved.providerAvailable && <a className="button outline" href={job.sourceUrl} target="_blank" rel="noopener noreferrer">View job<ExternalLink size={14} /></a>}
              <button className="button outline remove-saved" onClick={() => void removeSavedJob(saved.id)}>Remove saved job</button>
            </div>
          </li>;
        })}</ul>}
      {!accountIsPro && savedJobs.length >= saveLimit && <p className="field-hint">
        You’ve used all {saveLimit} Free saved-job slots. Remove one to save another, or choose Pro to save more and tailor a separate resume for each.{' '}
        <button className="text-button" onClick={onViewPro}>View Pro options</button>
      </p>}
    </section>

    {jobResumeVersions.some(version => !version.savedJobExists) && <section className="saved-jobs-section" aria-labelledby="job-resumes-heading">
      <div className="saved-jobs-heading"><h2 id="job-resumes-heading">Job-specific resumes</h2></div>
      <p className="field-hint">These documents are preserved even though their original saved-job bookmark was removed.</p>
      <ul className="jobs-results" aria-label="Job-specific resumes">{jobResumeVersions.filter(version => !version.savedJobExists).map(version => <li className="job-card saved-job-card" key={version.id}>
        <div className="job-card-heading"><div><h3>{version.jobSnapshot.title}</h3><span>{version.jobSnapshot.company}</span></div><span className="job-unavailable">Saved job removed</span></div>
        <div className="job-card-actions"><button className="button" onClick={() => void openJobResume(version)}>Open tailored resume</button></div>
      </li>)}</ul>
    </section>}

    {results && <>
      <div className="saved-jobs-heading"><h2>Opportunities worth your attention</h2></div>
      {results.jobs.length === 0 && <div className="empty-state"><strong>No matching roles in this search.</strong><p>Try a broader title or location, or remove a preference. Your saved jobs are still here.</p></div>}
      <p className="field-hint" role="status">
        {`Showing ${results.jobs.length} of ${results.availableCount} matching jobs.`}{' '}
        {!results.isPro && results.availableCount > results.jobs.length && <>{`Pro shows up to ${results.proLimit} per search. `}<button className="text-button" onClick={onViewPro}>View Pro options</button></>}
      </p>
      <ul className="jobs-results" aria-label="Job results">
        {results.jobs.map(job => <li className={`job-card job-card-${job.matchLabel}`} key={job.id}>
          <div className="job-card-heading">
            <div><h2>{job.title}</h2><span>{job.company}</span></div>
            <span className={`job-match-badge job-match-${job.matchLabel}`}>{MATCH_LABELS[job.matchLabel]}</span>
          </div>
          <div className="job-card-meta">
            <span>{formatLocation(job.location)}</span>
            <span>{WORKPLACE_LABELS[job.workplace]}</span>
            <span>{EMPLOYMENT_LABELS[job.employmentType]}</span>
            <span>{formatSalary(job.salary)}</span>
          </div>
          {!job.matchAnalysis && <ul className="job-card-reasons">{job.matchReasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
          {job.matchAnalysis && <MatchAnalysisPanel jobTitle={`${job.title} at ${job.company}`} analysis={job.matchAnalysis} isPro={results.isPro} onViewPro={onViewPro} onClarify={(id, value) => void clarify(id, value, { job })} />}
          <div className="job-card-actions">
            <a className="button outline" href={job.sourceUrl} target="_blank" rel="noopener noreferrer">View job<ExternalLink size={14} /></a>
            <button className="button outline" disabled={savedJobs.some(saved => saved.snapshot.id === job.id)} onClick={() => void saveJob(job)}><Bookmark size={14} />{savedJobs.some(saved => saved.snapshot.id === job.id) ? 'Saved' : 'Save job'}</button>
          </div>
        </li>)}
      </ul>
    </>}
    </div></div>
  </section>;
}
