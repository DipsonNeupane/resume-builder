/** Local APWICO V1 job recommendation experience over the provider-neutral
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
import { trackProductEvent } from '../../services/analytics';
import { emptyJobWorkflow, JobWorkflowPanel, type JobWorkflow } from './JobWorkflowPanel';
import { OutcomeReportPanel, type OutcomeReport, type OutcomeReportInput } from './OutcomeReportPanel';

type Workplace = 'remote' | 'hybrid' | 'onsite' | 'field';
type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary' | 'internship';
type MatchLabel = 'strong' | 'good' | 'stretch';
type SalaryPeriod = 'hour' | 'year';
type Requirement = { id: string; text: string; category: 'required' | 'preferred' | 'nice_to_have'; status: 'demonstrated' | 'partially_demonstrated' | 'not_demonstrated' | 'confirmed_incompatible'; evidence: string[] };
type MatchAnalysis = {
  version: 2; label: MatchLabel; resumeHash: string; jobHash: string; contextHash: string;
  whyPromising: string; observations: string[]; importantWarning: string | null; seniorityMessage: string | null;
  additionalAreasAnalyzed: number; clarification?: { requirementId: string; text: string };
  limitedAnalysis?: { requirements: Requirement[] };
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

export type WorkspaceTarget =
  | { kind: 'jobs' }
  | { kind: 'saved_jobs' }
  | { kind: 'match'; savedJobId: string }
  | { kind: 'job_resume'; versionId: string };

type Props = {
  resume: Resume;
  ownerId: string | null;
  masterReady: boolean;
  target: WorkspaceTarget;
  onSignIn: () => void;
  onViewPro: () => void;
  onBack: () => void;
  onOpenSavedJobs: () => void;
  onOpenMatch: (savedJobId: string) => void;
  onEditJobResume: (version: JobResumeVersion, masterChanged: boolean) => void;
};

const WORKPLACE_VALUES: Workplace[] = ['remote', 'hybrid', 'onsite', 'field'];
const EMPLOYMENT_VALUES: EmploymentType[] = ['full_time', 'part_time', 'contract', 'temporary', 'internship'];
const MATCH_VALUES: MatchLabel[] = ['strong', 'good', 'stretch'];
const PERIOD_VALUES: SalaryPeriod[] = ['hour', 'year'];
const DECISION_VALUES = ['review', 'pursue', 'pass'] as const;
const APPLICATION_STATUS_VALUES = ['not_applied', 'preparing', 'applied', 'interviewing', 'offer', 'closed', 'withdrawn'] as const;
const OUTCOME_VALUES = ['application_prepared','application_submitted','interview_received','offer_received','declined','withdrawn'] as const;
const TIME_SAVED_VALUES = ['under_15_minutes','15_to_30_minutes','31_to_60_minutes','over_60_minutes','unsure'] as const;

const WORKPLACE_LABELS: Record<Workplace | 'unknown', string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite', field: 'Field-based', unknown: 'Workplace not listed' };
const EMPLOYMENT_LABELS: Record<EmploymentType | 'unknown', string> = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', temporary: 'Temporary', internship: 'Internship', unknown: 'Employment type not listed' };
// These ranking buckets order source jobs; they are not hiring verdicts or
// requirement-level evidence states. Keep the visible label neutral and let
// the canonical evidence rows explain what is or is not demonstrated.
const MATCH_LABELS: Record<MatchLabel, string> = { strong: 'Review evidence', good: 'Review evidence', stretch: 'Review evidence' };

const DAY_MS = 24 * 60 * 60 * 1000;

class AccountRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AccountRequestError';
  }
}

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
  if (!record(value) || value.version !== 2 || typeof value.label !== 'string' || !MATCH_VALUES.includes(value.label as MatchLabel)
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
  if (value.limitedAnalysis !== undefined) {
    const limited = value.limitedAnalysis;
    if (!record(limited) || !Array.isArray(limited.requirements) || limited.requirements.length < 1 || limited.requirements.length > 3
      || !limited.requirements.every(item => record(item) && typeof item.id === 'string' && /^[0-9a-f]{16}$/.test(item.id)
        && typeof item.text === 'string' && item.text.length <= 400
        && ['required', 'preferred', 'nice_to_have'].includes(String(item.category))
        && ['demonstrated', 'partially_demonstrated', 'not_demonstrated', 'confirmed_incompatible'].includes(String(item.status))
        && Array.isArray(item.evidence) && item.evidence.length <= 5 && item.evidence.every(text => typeof text === 'string' && text.length <= 1000))) return null;
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
      || typeof item.snapshot.dedupeKey !== 'string' || !/^[0-9a-f]{64}$/.test(item.snapshot.dedupeKey)
      || typeof item.snapshot.company !== 'string' || !isSafeJobUrl(item.snapshot.sourceUrl)
      || typeof item.providerAvailable !== 'boolean' || typeof item.availabilityCheckedAt !== 'string'
      || (item.unavailableAt !== null && typeof item.unavailableAt !== 'string') || typeof item.savedAt !== 'string') return [];
    const saved = item as unknown as SavedJob;
    if (item.matchAnalysis != null) saved.matchAnalysis = parseMatchAnalysis(item.matchAnalysis);
    return [saved];
  });
}

function parseJobWorkflows(value: unknown): JobWorkflow[] | null {
  if (value === undefined) return [];
  if (value === null) return null;
  if (!Array.isArray(value)) throw new Error('Job workflow returned an unusable response.');
  return value.flatMap(item => {
    if (!record(item) || typeof item.savedJobId !== 'string'
      || typeof item.decision !== 'string' || !(DECISION_VALUES as readonly string[]).includes(item.decision)
      || typeof item.applicationStatus !== 'string' || !(APPLICATION_STATUS_VALUES as readonly string[]).includes(item.applicationStatus)
      || typeof item.notes !== 'string' || item.notes.length > 4000
      || typeof item.contactName !== 'string' || item.contactName.length > 200
      || typeof item.contactDetails !== 'string' || item.contactDetails.length > 500
      || typeof item.reminderEnabled !== 'boolean'
      || (item.reminderAt !== null && (typeof item.reminderAt !== 'string' || Number.isNaN(Date.parse(item.reminderAt))))
      || !Number.isSafeInteger(item.revision) || Number(item.revision) < 1
      || typeof item.updatedAt !== 'string' || Number.isNaN(Date.parse(item.updatedAt))
      || !Array.isArray(item.history) || item.history.length > 100
      || !item.history.every(entry => record(entry) && typeof entry.decision === 'string' && (DECISION_VALUES as readonly string[]).includes(entry.decision)
        && typeof entry.applicationStatus === 'string' && (APPLICATION_STATUS_VALUES as readonly string[]).includes(entry.applicationStatus)
        && typeof entry.changedAt === 'string' && !Number.isNaN(Date.parse(entry.changedAt)))) return [];
    return [item as unknown as JobWorkflow];
  });
}

function parseOutcomeReports(value: unknown): OutcomeReport[] | null {
  if (value === undefined) return [];
  if (value === null) return null;
  if (!Array.isArray(value)) throw new Error('Outcome reports returned an unusable response.');
  return value.flatMap(item => {
    if (!record(item) || typeof item.id !== 'string' || typeof item.savedJobId !== 'string'
      || typeof item.outcome !== 'string' || !(OUTCOME_VALUES as readonly string[]).includes(item.outcome)
      || item.provenance !== 'self_reported'
      || !(item.occurredOn === null || (typeof item.occurredOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.occurredOn)))
      || !(item.timeSavedBucket === null || (typeof item.timeSavedBucket === 'string' && (TIME_SAVED_VALUES as readonly string[]).includes(item.timeSavedBucket)))
      || !(item.clarityRating === null || (Number.isSafeInteger(item.clarityRating) && Number(item.clarityRating)>=1 && Number(item.clarityRating)<=5))
      || !(item.confidenceRating === null || (Number.isSafeInteger(item.confidenceRating) && Number(item.confidenceRating)>=1 && Number(item.confidenceRating)<=5))
      || item.consentVersion !== 'outcomes-v1' || item.methodologyVersion !== 'outcomes-v1'
      || !['consentedAt','reportedAt','updatedAt'].every(key=>typeof item[key]==='string'&&!Number.isNaN(Date.parse(item[key] as string)))) return [];
    return [item as unknown as OutcomeReport];
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
const STATUS_LABELS = { demonstrated: 'Clearly demonstrated', partially_demonstrated: 'Worth reviewing', not_demonstrated: 'Not demonstrated', confirmed_incompatible: 'Confirmed incompatibility' } as const;

function RequirementLedger({ requirements, scope, onReviewed }: { requirements: Requirement[]; scope: 'limited'|'full'; onReviewed: (scope: 'limited'|'full') => Promise<boolean> }) {
  const ledger = useRef<HTMLDivElement>(null);
  const recorded = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const node = ledger.current;
    if (!node || recorded.current) return;
    const observer = new IntersectionObserver(entries => {
      if (recorded.current || inFlight.current || !entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.35)) return;
      inFlight.current = true;
      void onReviewed(scope).then(success => {
        if (success) { recorded.current = true; observer.disconnect(); }
      }).finally(() => { inFlight.current = false; });
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onReviewed, scope]);
  return <div ref={ledger} className="match-requirements" data-review-scope={scope}>{requirements.map(req => <article key={req.id}>
    <div><span className={`requirement-category requirement-${req.category}`}>{CATEGORY_LABELS[req.category]}</span><span className={`requirement-status status-${req.status}`}>{STATUS_LABELS[req.status]}</span></div>
    <strong className="requirement-source-label">Job wording</strong><p>{req.text}</p>
    <strong className="requirement-source-label">Resume evidence</strong>{req.evidence.length ? req.evidence.map((item, index) => <small key={index}>{item}</small>) : <small>{req.status === 'confirmed_incompatible' ? 'You explicitly marked this requirement as incompatible.' : 'No supporting wording found in this review. That is unknown, not proof that you lack the qualification.'}</small>}
  </article>)}</div>;
}

function MatchAnalysisPanel({ analysis, isPro, onViewPro, onClarify, onEvidenceReviewed, jobTitle, fullAnalysisInitiallyOpen = true }: { jobTitle: string; analysis: MatchAnalysis; isPro: boolean; onViewPro: () => void; onClarify: (id: string, value: 'demonstrated'|'not_have'|'unsure') => void; onEvidenceReviewed: (scope: 'limited'|'full') => Promise<boolean>; fullAnalysisInitiallyOpen?: boolean }) {
  const full = analysis.fullAnalysis;
  const panel = useRef<HTMLElement>(null);
  const viewed = useRef(false);
  useEffect(() => {
    const node = panel.current;
    if (!node || viewed.current) return;
    const observer = new IntersectionObserver(entries => {
      if (!viewed.current && entries.some(entry => entry.isIntersecting)) {
        viewed.current = true;
        trackProductEvent('match_opened', { surface: 'match', user_state: 'authenticated', plan: isPro ? 'Pro' : 'Free' });
        observer.disconnect();
      }
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isPro]);
  return <section ref={panel} className="match-analysis" role="group" aria-label={`Match analysis — ${jobTitle}`}>
    <div className="match-analysis-header"><h3>What your resume shows</h3><span>Resume evidence · Match Analysis</span></div>
    <p>{analysis.whyPromising}</p><p className="field-hint">Based only on what your resume shows, not a prediction of hiring. “Not demonstrated” doesn’t mean you don’t have it.</p>
    <ul>{analysis.observations.slice(0, 3).map((item, index) => <li key={index}>{item}</li>)}</ul>
    {analysis.importantWarning && <div className="match-warning" role="note"><strong>Important requirement</strong><span>{analysis.importantWarning}</span></div>}
    {analysis.seniorityMessage && <p className="match-seniority">{analysis.seniorityMessage}</p>}
    {analysis.clarification && <fieldset className="match-clarification">
      <legend>Help APWICO understand this requirement</legend>
      <span>{analysis.clarification.text}</span>
      <div><button className="text-button" onClick={() => onClarify(analysis.clarification!.requirementId, 'demonstrated')}>I can demonstrate this</button><button className="text-button" onClick={() => onClarify(analysis.clarification!.requirementId, 'not_have')}>I don’t have this</button><button className="text-button" onClick={() => onClarify(analysis.clarification!.requirementId, 'unsure')}>Not sure</button></div>
    </fieldset>}
    {!isPro && analysis.limitedAnalysis && <div className="match-limited-analysis"><h4>Requirement evidence preview</h4><p className="field-hint">A limited evidence view from this role. Review the requirement, source wording, and what your resume demonstrates.</p><RequirementLedger requirements={analysis.limitedAnalysis.requirements} scope="limited" onReviewed={onEvidenceReviewed}/></div>}
    {!isPro && <div className="match-upgrade">
      {analysis.additionalAreasAnalyzed > 0 && <span>{analysis.additionalAreasAnalyzed} additional {analysis.additionalAreasAnalyzed === 1 ? 'area' : 'areas'} analyzed</span>}
      <button className="text-button" onClick={onViewPro}>View the full evidence analysis with Pro</button>
    </div>}
    {isPro && full && <details className="match-details" {...(fullAnalysisInitiallyOpen ? { open: true } : {})}><summary>Full evidence analysis</summary>
      <p>{full.deeperExplanation}</p>
      <RequirementLedger requirements={full.requirements} scope="full" onReviewed={onEvidenceReviewed}/>
      {full.strengths.length > 0 && <><h4>Strengths</h4><ul>{full.strengths.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
      {full.buriedEvidence.length > 0 && <><h4>Relevant experience that may be buried</h4><ul>{full.buriedEvidence.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
      {full.areasWorthStrengthening.length > 0 && <><h4>Areas worth strengthening</h4><ul>{full.areasWorthStrengthening.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
      {full.constraints.length > 0 && <><h4>Important constraints</h4><ul>{full.constraints.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
      <p className="field-hint">Save this job to start a separate job-specific resume. Your master resume stays unchanged, and no AI suggestion is applied without your review.</p>
    </details>}
  </section>;
}

export function JobsPanel({ resume, ownerId, masterReady, target, onSignIn, onViewPro, onBack, onOpenSavedJobs, onOpenMatch, onEditJobResume }: Props) {
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
  const recordedEvidence = useRef(new Set<string>());
  const [results, setResults] = useState<{ jobs: JobCard[]; isPro: boolean; availableCount: number; proLimit: number } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [saveLimit, setSaveLimit] = useState(3);
  const [accountIsPro, setAccountIsPro] = useState(false);
  const [accountLoaded, setAccountLoaded] = useState(false);
  const [accountLoadFailed, setAccountLoadFailed] = useState(false);
  const [accountLoadRevision, setAccountLoadRevision] = useState(0);
  const [nextFreeRefreshAt, setNextFreeRefreshAt] = useState(0);
  const [jobResumeVersions, setJobResumeVersions] = useState<JobResumeVersionSummary[]>([]);
  const [jobWorkflows, setJobWorkflows] = useState<JobWorkflow[]>([]);
  const [jobWorkflowsAvailable, setJobWorkflowsAvailable] = useState(true);
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);
  const [workflowConflictId, setWorkflowConflictId] = useState<string | null>(null);
  const [outcomeReports, setOutcomeReports] = useState<OutcomeReport[]>([]);
  const [outcomeReportsAvailable, setOutcomeReportsAvailable] = useState(true);
  const [outcomeBusyId, setOutcomeBusyId] = useState<string | null>(null);
  const [restoreFailure, setRestoreFailure] = useState<'unavailable' | 'transient' | null>(null);
  const [versionRestoreRevision, setVersionRestoreRevision] = useState(0);
  const inFlight = useRef(false);
  const active = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const lastCriteriaRef = useRef<Criteria | null>(null);
  const lastProviderRefreshRef = useRef(0);
  const savedJobsViewed = useRef(false);
  const currentOwnerRef = useRef(ownerId);
  const restoredVersionRef = useRef<string | null>(null);
  currentOwnerRef.current = ownerId;

  useEffect(() => {
    if (!accountLoaded || savedJobsViewed.current) return;
    savedJobsViewed.current = true;
    trackProductEvent('saved_jobs_viewed', { surface: 'jobs', user_state: ownerId ? 'authenticated' : 'anonymous', plan: accountIsPro ? 'Pro' : 'Free' });
  }, [accountLoaded]);

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
    if (!response.ok) throw new AccountRequestError(record(body) && typeof body.error === 'string' ? body.error : 'Saved jobs are temporarily unavailable.', response.status);
    if (!record(body)) throw new Error('Saved jobs returned an unusable response.');
    return body;
  }

  async function recordEvidenceReview(jobKey: string, analysisKey: string, scope: 'limited'|'full'): Promise<boolean> {
    const key = `${ownerId ?? 'anonymous'}:${jobKey}:${analysisKey}:${scope}`;
    if (recordedEvidence.current.has(key)) return true;
    recordedEvidence.current.add(key);
    try {
      const body = await accountRequest({ action: 'record_evidence_review', jobKey, analysisKey, reviewScope: scope });
      if (body.recorded !== true || (body.reviewScope !== 'limited' && body.reviewScope !== 'full') || typeof body.newlyRecorded !== 'boolean') throw new Error('Evidence review was not recorded.');
      if (body.newlyRecorded) trackProductEvent('evidence_reviewed', { surface: 'match', user_state: 'authenticated', plan: scope === 'full' ? 'Pro' : 'Free', review_depth: scope });
      return true;
    } catch {
      recordedEvidence.current.delete(key);
      return false;
    }
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
    setJobWorkflows([]);
    setJobWorkflowsAvailable(true);
    setWorkflowBusyId(null);
    setWorkflowConflictId(null);
    setOutcomeReports([]);
    setOutcomeReportsAvailable(true);
    setOutcomeBusyId(null);
    setRestoreFailure(null);
    setSaveLimit(3);
    setAccountIsPro(false);
    setAccountLoaded(false);
    setAccountLoadFailed(false);
    setNextFreeRefreshAt(0);
    recordedEvidence.current.clear();
    lastProviderRefreshRef.current = 0;
    lastCriteriaRef.current = null;
    const restoringEvidence = target.kind === 'match' || target.kind === 'job_resume';
    const loadAction = masterReady ? { action: 'load', evidence: buildResumeEvidence(resume) } : { action: 'load' };
    if (ownerId && (masterReady || !restoringEvidence)) void accountRequest(loadAction, controller.signal).then(body => {
      if (controller.signal.aborted) return;
      const preferences = body.preferences;
      if (!record(preferences) || typeof preferences.autoRefresh !== 'boolean'
        || typeof body.isPro !== 'boolean' || typeof body.saveLimit !== 'number') throw new Error('Saved jobs returned an unusable response.');
      const criteria = preferences.criteria === null ? null : preferences.criteria as Criteria;
      setSavedJobs(parseSavedJobs(body.savedJobs));
      setJobResumeVersions(parseJobResumeSummaries(body.jobResumeVersions ?? []));
      const workflows = parseJobWorkflows(body.jobWorkflows);
      setJobWorkflows(workflows ?? []);
      setJobWorkflowsAvailable(workflows !== null);
      const outcomes = parseOutcomeReports(body.outcomeReports);
      setOutcomeReports(outcomes ?? []);
      setOutcomeReportsAvailable(outcomes !== null);
      setSaveLimit(body.saveLimit);
      setAccountIsPro(body.isPro);
      setAccountLoaded(true);
      setAutoRefresh(preferences.autoRefresh);
      lastCriteriaRef.current = criteria;
      lastProviderRefreshRef.current = typeof preferences.lastProviderRefreshAt === 'string' ? Date.parse(preferences.lastProviderRefreshAt) : 0;
      setNextFreeRefreshAt(body.isPro || !lastProviderRefreshRef.current ? 0 : lastProviderRefreshRef.current + DAY_MS);
      if (criteria && typeof criteria.title === 'string') applyCriteria(criteria);
    }).catch(error => {
      if (!controller.signal.aborted) { setAccountLoadFailed(true); setMessage(error instanceof Error ? error.message : 'Saved jobs are temporarily unavailable.'); }
    });
    return () => { active.current = false; controller.abort(); controllerRef.current?.abort(); };
    // accountRequest intentionally resolves the currently verified owner each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, masterReady, accountLoadRevision, target.kind]);

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
      trackProductEvent('jobs_search_performed', { surface: 'jobs', user_state: 'authenticated', plan: parsed.isPro ? 'Pro' : 'Free', outcome: 'success', result_bucket: parsed.jobs.length ? 'some' : 'none' });
      if (parsed.jobs.some(job=>Boolean(job.matchAnalysis))) trackProductEvent('requirements_extracted', { surface: 'match', user_state: 'authenticated', plan: parsed.isPro ? 'Pro' : 'Free', outcome: 'success', result_bucket: 'some', job_source: 'search' });
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
      trackProductEvent('job_saved', { surface: 'jobs', user_state: 'authenticated', plan: accountIsPro ? 'Pro' : 'Free', outcome: 'success', job_source: 'search' });
      trackProductEvent('job_added', { surface: 'jobs', user_state: 'authenticated', plan: accountIsPro ? 'Pro' : 'Free', outcome: 'success', job_source: 'search' });
      trackProductEvent('decision_recorded', { surface: 'match', user_state: 'authenticated', plan: accountIsPro ? 'Pro' : 'Free', decision: 'save_later' });
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
      trackProductEvent('requirements_extracted', { surface: 'match', user_state: 'authenticated', plan: accountIsPro ? 'Pro' : 'Free', outcome: 'success', result_bucket: 'some' });
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
      trackProductEvent('decision_recorded', { surface: 'match', user_state: 'authenticated', plan: accountIsPro ? 'Pro' : 'Free', decision: 'clarify' });
      setMessage('Thanks. Match Analysis updated with your answer. This didn’t use a job search.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save this clarification.'); }
  }

  async function removeSavedJob(savedJobId: string) {
    const requestedOwner = ownerId;
    try {
      await accountRequest({ action: 'remove', savedJobId });
      if (currentOwnerRef.current !== requestedOwner) return;
      setSavedJobs(current => current.filter(job => job.id !== savedJobId));
      setJobWorkflows(current => current.filter(workflow => workflow.savedJobId !== savedJobId));
      setOutcomeReports(current => current.filter(report => report.savedJobId !== savedJobId));
      setJobResumeVersions(current => current.map(version => version.savedJobId === savedJobId ? { ...version, savedJobExists: false } : version));
      setMessage('Saved job removed. Any job-specific resume for it is kept.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to remove this saved job.'); }
  }

  async function saveWorkflow(savedJobId: string, workflow: JobWorkflow) {
    if (!jobWorkflowsAvailable) return;
    const requestedOwner = ownerId;
    const previous = jobWorkflows.find(item => item.savedJobId === savedJobId) ?? emptyJobWorkflow(savedJobId);
    setWorkflowBusyId(savedJobId);
    try {
      const body = await accountRequest({ action: 'update_workflow', savedJobId, expectedRevision: workflow.revision, workflow: {
        decision: workflow.decision, applicationStatus: workflow.applicationStatus,
        notes: workflow.notes, contactName: workflow.contactName, contactDetails: workflow.contactDetails,
        reminderEnabled: workflow.reminderEnabled, reminderAt: workflow.reminderEnabled ? workflow.reminderAt : null,
      } });
      const parsed = parseJobWorkflows([body.workflow])?.[0];
      if (!parsed) throw new Error('Job workflow returned an unusable response.');
      if (currentOwnerRef.current !== requestedOwner) return;
      setJobWorkflows(current => [parsed, ...current.filter(item => item.savedJobId !== savedJobId)]);
      setWorkflowConflictId(null);
      if (previous.decision !== parsed.decision) trackProductEvent('decision_recorded', { surface: 'jobs', user_state: 'authenticated', plan: accountIsPro ? 'Pro' : 'Free', decision: parsed.decision });
      if (previous.applicationStatus !== parsed.applicationStatus && parsed.applicationStatus !== 'not_applied') trackProductEvent('application_status_recorded', { surface: 'jobs', user_state: 'authenticated', plan: accountIsPro ? 'Pro' : 'Free', application_status: parsed.applicationStatus });
      setMessage('Your decision and application update were saved.');
    } catch (error) {
      if (currentOwnerRef.current === requestedOwner) {
        if (error instanceof AccountRequestError && error.status === 409) setWorkflowConflictId(savedJobId);
        setMessage(error instanceof Error ? error.message : 'Unable to save this job update.');
      }
    } finally {
      if (currentOwnerRef.current === requestedOwner) setWorkflowBusyId(null);
    }
  }

  async function saveOutcome(savedJobId: string, report: OutcomeReportInput) {
    if (!outcomeReportsAvailable) return;
    const requestedOwner=ownerId;
    setOutcomeBusyId(savedJobId);
    try {
      const body=await accountRequest({action:'report_outcome',savedJobId,report});
      const parsed=parseOutcomeReports([body.report])?.[0];
      if(!parsed)throw new Error('Outcome report returned an unusable response.');
      if(currentOwnerRef.current!==requestedOwner)return;
      setOutcomeReports(current=>[parsed,...current.filter(item=>!(item.savedJobId===savedJobId&&item.outcome===parsed.outcome))]);
      setMessage('Your voluntary self-reported outcome was saved.');
    } catch(error) {
      if(currentOwnerRef.current===requestedOwner)setMessage(error instanceof Error?error.message:'Unable to save this voluntary outcome.');
    } finally {
      if(currentOwnerRef.current===requestedOwner)setOutcomeBusyId(null);
    }
  }

  async function openJobResume(summary: JobResumeVersionSummary) {
    if (!ownerId) return;
    const requestedOwner = ownerId;
    setRestoreFailure(null);
    try {
      const body = await accountRequest({ action: 'get_job_resume', versionId: summary.id });
      const version = parseJobResumeVersion(body.version);
      const masterChanged = version.sourceMasterFingerprint !== await fingerprintResume(resume);
      if (currentOwnerRef.current !== requestedOwner) return;
      onEditJobResume(version, masterChanged);
    } catch (error) {
      const unavailable = error instanceof AccountRequestError && [401, 403, 404].includes(error.status);
      setRestoreFailure(unavailable ? 'unavailable' : 'transient');
      setMessage(error instanceof Error ? error.message : 'Unable to load this job-specific resume.');
    }
  }

  useEffect(() => {
    if (!ownerId || !accountLoaded || target.kind !== 'job_resume' || restoredVersionRef.current === target.versionId) return;
    const summary = jobResumeVersions.find(version => version.id === target.versionId);
    if (!summary) return;
    restoredVersionRef.current = target.versionId;
    void openJobResume(summary);
    // openJobResume deliberately verifies the live account before and after fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoaded, masterReady, ownerId, target.kind, target.kind === 'job_resume' ? target.versionId : '', jobResumeVersions, versionRestoreRevision]);

  async function startTailoring(saved: SavedJob) {
    if (!ownerId) return;
    const existing = jobResumeVersions.find(version => version.savedJobId === saved.id);
    if (existing) { await openJobResume(existing); return; }
    const workflow = jobWorkflows.find(item => item.savedJobId === saved.id) ?? emptyJobWorkflow(saved.id);
    if (workflow.decision !== 'pursue') {
      setMessage('Choose “Pursue — I want to continue” and save your decision before creating its job-specific resume.');
      return;
    }
    if (!accountIsPro) { onViewPro(); return; }
    const requestedOwner = ownerId;
    try {
      const body = await accountRequest({ action: 'create_job_resume', savedJobId: saved.id, resume });
      const version = parseJobResumeVersion(body.version);
      if (currentOwnerRef.current !== requestedOwner) return;
      setJobResumeVersions(current => current.some(item => item.id === version.id) ? current : [{ ...version, savedJobExists: true }, ...current]);
      trackProductEvent('decision_recorded', { surface: 'match', user_state: 'authenticated', plan: 'Pro', decision: 'tailor' });
      trackProductEvent('job_specific_version_created', { surface: 'tailoring', user_state: 'authenticated', plan: 'Pro', document_scope: 'job_specific' });
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

  const privateHeading = target.kind === 'match' ? 'Match Analysis'
    : target.kind === 'job_resume' ? 'Job-specific resume'
    : target.kind === 'saved_jobs' ? 'Saved jobs'
    : 'Find jobs';

  if (!ownerId) {
    return <section className="field jobs-panel" aria-label="Job search">
      <div className="jobs-panel-heading">
        <div>{target.kind !== 'jobs'&&<span className="section-label">Private opportunity workspace</span>}<h1>{privateHeading}</h1><p>{target.kind === 'jobs' ? 'Sign in to search for jobs and save opportunities.' : 'Sign in to restore this workspace state. APWICO verifies ownership before showing any saved job, evidence, or job-specific document.'}</p></div>
        <button className="back-link" onClick={onBack}>Back</button>
      </div>
      <div className="notice" role="status">
        Sign in to search and save jobs. Free includes one search every 24 hours with up to 10 relevant results.
        <button className="text-button" onClick={onSignIn}>Sign in or create account</button>
      </div>
    </section>;
  }

  if (!masterReady && (target.kind === 'match' || target.kind === 'job_resume')) return <section className="field jobs-panel" aria-label="Opportunity workspace restoration">
    <div className="jobs-panel-heading"><div><span className="section-label">Private workspace</span><h1>{privateHeading}</h1><p>Finish the master-resume recovery, storage choice, or account conflict shown above before using job evidence.</p></div><button className="back-link" onClick={onBack}>Back</button></div>
    <p className="route-loading" role="status">Waiting for your master resume to be ready…</p>
  </section>;

  const retryAccountLoad = () => setAccountLoadRevision(value => value + 1);
  if ((target.kind === 'match' || target.kind === 'job_resume') && accountLoadFailed) return <section className="field jobs-panel" aria-label="Workspace restoration">
    <div className="jobs-panel-heading"><div><span className="section-label">Private workspace</span><h1>{privateHeading}</h1></div><button className="back-link" onClick={onOpenSavedJobs}>Back to saved jobs</button></div>
    <div className="empty-state" role="alert"><strong>This workspace item is temporarily unavailable.</strong><p>APWICO could not verify and restore the owner-scoped item. No job or resume content was loaded.</p><button className="button" onClick={retryAccountLoad}>Retry</button></div>
  </section>;


  if (target.kind === 'job_resume') {
    const exists = jobResumeVersions.some(version => version.id === target.versionId);
    const retryVersionRestore = () => {
      restoredVersionRef.current = null;
      setRestoreFailure(null);
      setVersionRestoreRevision(value => value + 1);
    };
    return <section className="field jobs-panel" aria-label="Job-specific resume restoration">
      <div className="jobs-panel-heading"><div><span className="section-label">Private workspace</span><h1>Job-specific resume</h1></div><button className="back-link" onClick={onOpenSavedJobs}>Back to saved jobs</button></div>
      {!accountLoaded || !masterReady ? <p className="route-loading" role="status">Restoring your master resume and owner-scoped version…</p>
        : exists && !restoreFailure ? <p className="route-loading" role="status">Opening your job-specific resume. Your master resume remains unchanged.</p>
        : exists && restoreFailure === 'transient' ? <div className="empty-state" role="alert"><strong>This version is temporarily unavailable.</strong><p>APWICO could not complete the owner-scoped restore. No resume content was loaded.</p><button className="button" onClick={retryVersionRestore}>Retry</button></div>
        : <div className="empty-state" role="status"><strong>This workspace item is unavailable.</strong><p>It may have been removed, belong to another account, or no longer be accessible. No resume content was loaded.</p><button className="button" onClick={onOpenSavedJobs}>Go to saved jobs</button></div>}
    </section>;
  }

  if (target.kind === 'match') {
    const saved = savedJobs.find(job => job.id === target.savedJobId);
    if (!accountLoaded || !masterReady) return <section className="field jobs-panel" aria-label="Match Analysis restoration"><h1>Match Analysis</h1><p className="route-loading" role="status">Restoring your master resume and owner-scoped evidence…</p></section>;
    if (!saved) return <section className="field jobs-panel" aria-label="Match Analysis restoration">
      <div className="jobs-panel-heading"><div><span className="section-label">Private workspace</span><h1>Match Analysis</h1></div><button className="back-link" onClick={onOpenSavedJobs}>Back to saved jobs</button></div>
      <div className="empty-state" role="status"><strong>This workspace item is unavailable.</strong><p>It may have been removed, belong to another account, or no longer be accessible. No job or resume content was loaded.</p><button className="button" onClick={onOpenSavedJobs}>Go to saved jobs</button></div>
    </section>;
    const job = saved.snapshot;
    const workflow = jobWorkflows.find(item => item.savedJobId === saved.id) ?? emptyJobWorkflow(saved.id);
    return <section className="field jobs-panel" aria-label="Match Analysis">
      <div className="jobs-panel-heading"><div><span className="section-label">Saved job · Private workspace</span><h1>Match Analysis</h1><p>{job.title} at {job.company}</p></div><button className="back-link" onClick={onOpenSavedJobs}>Back to saved jobs</button></div>
      {message && <p role="status" className="field-hint">{message}</p>}
      {saved.analysisCurrent === false && <><p className="match-stale" role="status">This analysis needs refreshing because its saved context changed.</p><button className="button" onClick={() => void refreshSavedAnalysis(saved.id)}>Refresh Match Analysis</button></>}
      {saved.analysisCurrent !== false && saved.matchAnalysis
        ? <MatchAnalysisPanel jobTitle={`${job.title} at ${job.company}`} analysis={saved.matchAnalysis} isPro={accountIsPro} onViewPro={onViewPro} onClarify={(id, value) => void clarify(id, value, { savedJobId: saved.id })} onEvidenceReviewed={scope => recordEvidenceReview(job.dedupeKey as string, saved.matchAnalysis!.contextHash, scope)} />
        : <div className="empty-state"><strong>Evidence is not available yet.</strong><p>Return to saved jobs to refresh this role against your current master resume.</p></div>}
      <JobWorkflowPanel value={workflow} busy={workflowBusyId === saved.id} available={jobWorkflowsAvailable} conflict={workflowConflictId === saved.id} onReload={()=>setAccountLoadRevision(value=>value+1)} onSave={next => saveWorkflow(saved.id, next)} />
      <OutcomeReportPanel reports={outcomeReports.filter(item=>item.savedJobId===saved.id)} busy={outcomeBusyId===saved.id} available={outcomeReportsAvailable} onReport={report=>saveOutcome(saved.id,report)}/>
      {!jobResumeVersions.some(version => version.savedJobId === saved.id) && workflow.decision !== 'pursue' && <p className="field-hint">Choose Pursue and save your decision before creating a separate job-specific resume.</p>}
      <div className="job-card-actions"><button className="button" disabled={!jobResumeVersions.some(version => version.savedJobId === saved.id) && workflow.decision !== 'pursue'} onClick={() => void startTailoring(saved)}>{jobResumeVersions.some(version => version.savedJobId === saved.id) ? 'Open job-specific resume' : accountIsPro ? 'Create a separate job-specific resume' : 'Tailor my resume with Pro'}</button></div>
    </section>;
  }

  return <section className="field jobs-panel" aria-label="Job search">
    <div className="jobs-panel-heading">
        <div><span className="section-label">Your opportunity workspace</span><h1>{target.kind === 'saved_jobs' ? 'Saved jobs' : 'Find jobs'}</h1><p>{target.kind === 'saved_jobs' ? 'Roles and evidence you explicitly chose to keep.' : 'Opportunities sourced across 190+ job portals and employer career sites. See what each role asks for, and what your resume already shows.'}</p></div>
      <button className="back-link" onClick={onBack}>Back</button>
    </div>
    <div className={`opportunity-desk ${target.kind === 'saved_jobs' ? 'saved-only' : ''}`}>{target.kind === 'jobs' && <aside className="opportunity-search" aria-label="Search preferences"><h2>Find your next fit</h2>
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
    {accountLoaded && !accountIsPro && !freeRefreshBlocked && <p className="field-hint">Free accounts get one search every 24 hours, with up to 10 relevant results. Set your criteria first.</p>}
    {!masterReady && <p className="field-hint" role="status">Saved jobs remain available, but search and Match updates pause until your master resume recovery or account check is resolved.</p>}
    <button className="button" disabled={busy || freeRefreshBlocked || !masterReady} onClick={search}><Search size={16} />{busy ? 'Searching…' : 'Search jobs'}</button>
    {freeRefreshBlocked && <p className="field-hint" role="status">Free recommendations can refresh again {formatRefreshTime(nextFreeRefreshAt)}. Your current results and saved jobs stay available. Pro has no once-a-day limit. <button className="text-button" onClick={onViewPro}>View Pro options</button></p>}

    <div className="jobs-toolbar">
      {results && <button className="text-button" disabled={busy || freeRefreshBlocked || !masterReady} onClick={refresh}><RefreshCw size={14} />Refresh</button>}
      <label className="jobs-auto-refresh"><input type="checkbox" checked={autoRefresh} onChange={event => void toggleAutoRefresh(event.target.checked)} />{accountIsPro ? 'Auto Refresh (daily background update)' : 'Auto Refresh (once a day)'}</label>
    </div>

    </aside>}<div className="opportunity-content">
    {message && <p role="status" className="field-hint">{message}</p>}
    {busy && <div className="jobs-skeleton" role="status"><strong>Looking for opportunities…</strong><span aria-hidden="true"/><span aria-hidden="true"/><p className="field-hint">Checking each role against your preferences and the evidence in your resume.</p></div>}
    {target.kind === 'jobs' && !results && !busy && savedJobs.length === 0 && <div className="empty-state"><strong>Your experience is the starting point.</strong><p>Choose a suggested role or enter your own criteria, then search. You’ll see why each opportunity may fit before deciding what to save.</p></div>}

    <section className="saved-jobs-section" aria-labelledby="saved-jobs-heading">
      <div className="saved-jobs-heading"><h2 id="saved-jobs-heading">Saved jobs</h2><span>{savedJobs.length}{accountIsPro ? '' : ` of ${saveLimit}`}</span></div>
      {savedJobs.length === 0 ? <div className="empty-state"><strong>Keep the roles worth a second look.</strong><p>Choose “Save job” on a result to keep it and its match evidence here, even if the listing closes{accountIsPro ? ' or your Pro access ends' : ''}.{accountIsPro ? '' : ` Free accounts can save up to ${saveLimit}.`}</p></div> :
	        <ul className="jobs-results" aria-label="Saved jobs">{savedJobs.map(saved => {
	          const job = saved.snapshot;
	          const workflow = jobWorkflows.find(item => item.savedJobId === saved.id) ?? emptyJobWorkflow(saved.id);
          return <li className="job-card saved-job-card" key={saved.id}>
            <div className="job-card-heading"><div><h3>{job.title}</h3><span>{job.company}</span></div>
              {!saved.providerAvailable && <span className="job-unavailable">No longer available</span>}
            </div>
	            <div className="saved-job-state"><span>{saved.matchAnalysis ? 'Match Analysis available' : 'Match evidence pending'}</span><span>{jobResumeVersions.some(version => version.savedJobId === saved.id) ? 'Tailored resume saved' : 'Master resume unchanged'}</span></div>
	            {workflow.reminderEnabled && workflow.reminderAt && <p className="field-hint" role="status">{Date.parse(workflow.reminderAt) <= Date.now() ? 'Follow-up due' : 'Follow up'}: {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(workflow.reminderAt))}</p>}
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
            {saved.analysisCurrent !== false && saved.matchAnalysis && <MatchAnalysisPanel jobTitle={`Saved: ${job.title} at ${job.company}`} analysis={saved.matchAnalysis} isPro={accountIsPro} onViewPro={onViewPro} onClarify={(id, value) => void clarify(id, value, { savedJobId: saved.id })} onEvidenceReviewed={scope=>recordEvidenceReview(job.dedupeKey as string,saved.matchAnalysis!.contextHash,scope)} fullAnalysisInitiallyOpen={false} />}
	            <JobWorkflowPanel value={workflow} busy={workflowBusyId === saved.id} available={jobWorkflowsAvailable} conflict={workflowConflictId === saved.id} onReload={()=>setAccountLoadRevision(value=>value+1)} onSave={next => saveWorkflow(saved.id, next)} />
	            <OutcomeReportPanel reports={outcomeReports.filter(item=>item.savedJobId===saved.id)} busy={outcomeBusyId===saved.id} available={outcomeReportsAvailable} onReport={report=>saveOutcome(saved.id,report)}/>
	            {!jobResumeVersions.some(version => version.savedJobId === saved.id) && workflow.decision !== 'pursue' && <p className="field-hint">Choose Pursue and save your decision before creating a separate job-specific resume.</p>}
	            <div className="job-card-actions">
              {saved.matchAnalysis && <button className="button outline" onClick={() => onOpenMatch(saved.id)}>Open Match Analysis</button>}
	              <button className="button" disabled={!jobResumeVersions.some(version => version.savedJobId === saved.id) && workflow.decision !== 'pursue'} onClick={() => void startTailoring(saved)}>
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

    {target.kind === 'jobs' && results && <>
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
          {job.matchAnalysis && <MatchAnalysisPanel jobTitle={`${job.title} at ${job.company}`} analysis={job.matchAnalysis} isPro={results.isPro} onViewPro={onViewPro} onClarify={(id, value) => void clarify(id, value, { job })} onEvidenceReviewed={scope=>recordEvidenceReview(job.savedSnapshot.dedupeKey as string,job.matchAnalysis!.contextHash,scope)} />}
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
