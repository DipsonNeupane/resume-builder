/** Application tracker vocabulary and validation shared by the browser and server.
 * The database (migration 20261027120000_application_tracker.sql) enforces the same
 * closed vocabularies; this module gives both sides one definition and plain labels. */

export const STAGES = ['saved', 'preparing', 'applied', 'interviewing', 'offer', 'closed'] as const;
export const CLOSED_REASONS = ['rejected', 'withdrawn', 'role_closed', 'no_response', 'archived', 'other'] as const;
export const ORIGINS = ['user', 'capture', 'suggestion', 'import'] as const;
export type Stage = typeof STAGES[number];
export type ClosedReason = typeof CLOSED_REASONS[number];
export type Origin = typeof ORIGINS[number];

export const STAGE_LABELS: Record<Stage, string> = {
  saved: 'Saved', preparing: 'Preparing', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', closed: 'Closed',
};
export const STAGE_HINTS: Record<Stage, string> = {
  saved: 'Interested; application not started',
  preparing: 'Preparing materials',
  applied: 'Submission confirmed by you',
  interviewing: 'Interview process underway',
  offer: 'Offer received',
  closed: 'No longer active',
};
export const CLOSED_REASON_LABELS: Record<ClosedReason, string> = {
  rejected: 'Rejected', withdrawn: 'I withdrew', role_closed: 'Role closed', no_response: 'No response', archived: 'Archived', other: 'Other',
};
export const ORIGIN_LABELS: Record<Origin, string> = {
  user: 'You', capture: 'Saved from a supported job page', suggestion: 'Suggested update you confirmed', import: 'Imported',
};

export const APPLICATION_LIMITS = {
  company: 300, title: 300, location: 200, url: 2048, description: 12000, notes: 4000,
  contactName: 200, contactDetails: 500, nextAction: 300, importRows: 200,
} as const;

export type ApplicationSalary = { min: number; max: number; currency: string; period: 'hour' | 'year' };
export type ApplicationInput = {
  company: string;
  title: string;
  stage: Stage;
  closedReason: ClosedReason | null;
  sourceUrl: string | null;
  location: string;
  workplace: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  salary: ApplicationSalary | null;
  descriptionText: string;
  appliedOn: string | null;
  nextAction: string;
  nextActionDue: string | null;
  notes: string;
  contactName: string;
  contactDetails: string;
};

export type ApplicationEvent = { kind: 'created' | 'stage_changed' | 'next_action' | 'document_attached' | 'imported'; fromStage: Stage | null; toStage: Stage | null; closedReason: ClosedReason | null; origin: Origin; occurredAt: string };
export type ApplicationDocument = { id: string; format: 'pdf' | 'docx'; template: string; sourceKind: 'master' | 'job_version'; jobResumeVersionId: string | null; exportedAt: string; submittedAt: string | null };
export type ApplicationRecord = {
  savedJobId: string; stage: Stage; closedReason: ClosedReason | null; priorStage: Stage | null; appliedOn: string | null;
  nextAction: string; nextActionDue: string | null; notes: string; contactName: string; contactDetails: string;
  origin: Origin; revision: number; createdAt: string; updatedAt: string; events: ApplicationEvent[]; documents: ApplicationDocument[];
  /** Owner corrections to extracted requirements (validated server-side). */
  requirementEdits?: RequirementEdits;
};
export type RequirementEdits = { removed: string[]; categories: Record<string, 'required' | 'preferred' | 'nice_to_have'>; added: { id: string; text: string; category: 'required' | 'preferred' | 'nice_to_have' }[] };
/** Fields an update may change. Absent keys keep their stored value. */
export type ApplicationPatch = Partial<Pick<ApplicationRecord, 'stage' | 'closedReason' | 'appliedOn' | 'nextAction' | 'nextActionDue' | 'notes' | 'contactName' | 'contactDetails'>>;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max && !CONTROL.test(value.replace(/[\n\r\t]/g, ' ')); }
export function isStage(value: unknown): value is Stage { return typeof value === 'string' && (STAGES as readonly string[]).includes(value); }
export function isClosedReason(value: unknown): value is ClosedReason { return typeof value === 'string' && (CLOSED_REASONS as readonly string[]).includes(value); }
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function timestamp(value: unknown): value is string { return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value)); }

/** Absolute public https URL without credentials, IP literal, nonstandard port or local name.
 * Mirrors server/jobs/url.ts so the browser can validate before sending. */
export function publicJobUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > APPLICATION_LIMITS.url) return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')
    || /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host)) return null;
  return url.toString();
}

/** Mirrors public.jobs_source_identity(): tracking parameters are removed individually,
 * meaningful identifiers, their order and any fragment are kept, host case is ignored. */
export function sourceIdentity(value: string): string {
  const hashAt = value.indexOf('#');
  const fragment = hashAt >= 0 ? value.slice(hashAt) : '';
  const withoutFragment = hashAt >= 0 ? value.slice(0, hashAt) : value;
  const queryAt = withoutFragment.indexOf('?');
  const base = queryAt >= 0 ? withoutFragment.slice(0, queryAt) : withoutFragment;
  const query = queryAt >= 0 ? withoutFragment.slice(queryAt + 1) : '';
  const kept = query.split('&').filter(part => part && !/^(?:utm_[a-z_]+|gclid|fbclid|msclkid|mc_[a-z]+|_hs[a-z]+|ref|refid|trk|trackingid|source|src)=/i.test(part));
  const host = base.match(/^https?:\/\/[^/]+/i)?.[0] ?? '';
  return `${host.toLowerCase()}${base.slice(host.length).replace(/\/+$/, '')}${kept.length ? `?${kept.join('&')}` : ''}${fragment}`;
}

/** Same company and role (case/punctuation-insensitive): a possible duplicate to review, never a hard merge. */
export function looseKey(company: string, title: string): string {
  const norm = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return `${norm(company)}|${norm(title)}`;
}

export class ApplicationInputError extends Error {
  constructor(readonly field: string, message: string) { super(message); this.name = 'ApplicationInputError'; }
}

/** Validates one quick-add/import row. Only company, role and stage are required. */
export function parseApplicationInput(value: unknown, today = new Date()): ApplicationInput {
  if (!record(value)) throw new ApplicationInputError('row', 'Application details are missing.');
  const company = typeof value.company === 'string' ? value.company.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!company || !text(company, APPLICATION_LIMITS.company)) throw new ApplicationInputError('company', 'Add the company name (up to 300 characters).');
  if (!title || !text(title, APPLICATION_LIMITS.title)) throw new ApplicationInputError('title', 'Add the role title (up to 300 characters).');
  const stage = value.stage === undefined || value.stage === '' ? 'saved' : value.stage;
  if (!isStage(stage)) throw new ApplicationInputError('stage', 'Choose a stage: Saved, Preparing, Applied, Interviewing, Offer or Closed.');
  const closedReason = stage === 'closed' ? (value.closedReason ?? 'other') : null;
  if (closedReason !== null && !isClosedReason(closedReason)) throw new ApplicationInputError('closedReason', 'Choose why this application is closed.');
  let sourceUrl: string | null = null;
  if (value.sourceUrl !== undefined && value.sourceUrl !== null && value.sourceUrl !== '') {
    sourceUrl = publicJobUrl(value.sourceUrl);
    if (!sourceUrl) throw new ApplicationInputError('sourceUrl', 'Use a public https job link, or leave the link empty.');
  }
  const location = value.location === undefined ? '' : value.location;
  if (!text(location, APPLICATION_LIMITS.location)) throw new ApplicationInputError('location', 'Location is too long.');
  const workplace = value.workplace === undefined || value.workplace === '' ? 'unknown' : value.workplace;
  if (workplace !== 'remote' && workplace !== 'hybrid' && workplace !== 'onsite' && workplace !== 'unknown') throw new ApplicationInputError('workplace', 'Workplace must be remote, hybrid, on-site or not listed.');
  let salary: ApplicationSalary | null = null;
  if (value.salary !== undefined && value.salary !== null) {
    const raw = value.salary;
    if (!record(raw) || typeof raw.min !== 'number' || typeof raw.max !== 'number' || !Number.isFinite(raw.min) || !Number.isFinite(raw.max)
      || raw.min < 0 || raw.min > raw.max || raw.max > 100_000_000 || typeof raw.currency !== 'string' || !/^[A-Z]{3}$/.test(raw.currency)
      || (raw.period !== 'hour' && raw.period !== 'year')) throw new ApplicationInputError('salary', 'Salary needs a minimum, maximum, three-letter currency and hourly or yearly period.');
    salary = { min: raw.min, max: raw.max, currency: raw.currency, period: raw.period };
  }
  const descriptionText = value.descriptionText === undefined ? '' : value.descriptionText;
  if (!text(descriptionText, APPLICATION_LIMITS.description)) throw new ApplicationInputError('descriptionText', 'Job description is too long (12,000 characters maximum).');
  const tomorrow = new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10);
  const appliedOn = value.appliedOn === undefined || value.appliedOn === '' ? null : value.appliedOn;
  if (appliedOn !== null && (!isIsoDay(appliedOn) || appliedOn > tomorrow)) throw new ApplicationInputError('appliedOn', 'Applied date must be a real date that is not in the future.');
  const nextAction = value.nextAction === undefined ? '' : value.nextAction;
  if (!text(nextAction, APPLICATION_LIMITS.nextAction)) throw new ApplicationInputError('nextAction', 'Next action is too long (300 characters maximum).');
  const nextActionDue = value.nextActionDue === undefined || value.nextActionDue === '' ? null : value.nextActionDue;
  if (nextActionDue !== null && !timestamp(nextActionDue)) throw new ApplicationInputError('nextActionDue', 'Next action date is not a valid date.');
  if (nextActionDue !== null && !(nextAction as string).trim()) throw new ApplicationInputError('nextAction', 'Describe the next action for its due date.');
  for (const [key, max] of [['notes', APPLICATION_LIMITS.notes], ['contactName', APPLICATION_LIMITS.contactName], ['contactDetails', APPLICATION_LIMITS.contactDetails]] as const) {
    if (value[key] !== undefined && !text(value[key], max)) throw new ApplicationInputError(key, `${key === 'notes' ? 'Notes are' : 'Contact details are'} too long.`);
  }
  return {
    company, title, stage, closedReason: closedReason as ClosedReason | null, sourceUrl,
    location: (location as string).trim(), workplace, salary, descriptionText: descriptionText as string,
    appliedOn: appliedOn as string | null, nextAction: (nextAction as string).trim(), nextActionDue: nextActionDue as string | null,
    notes: typeof value.notes === 'string' ? value.notes : '', contactName: typeof value.contactName === 'string' ? value.contactName.trim() : '',
    contactDetails: typeof value.contactDetails === 'string' ? value.contactDetails.trim() : '',
  };
}

/** Validates an update patch; the database re-checks every rule transactionally. */
export function parseApplicationPatch(value: unknown): ApplicationPatch {
  if (!record(value)) throw new ApplicationInputError('patch', 'Application update is invalid.');
  const patch: ApplicationPatch = {};
  if (value.stage !== undefined) { if (!isStage(value.stage)) throw new ApplicationInputError('stage', 'Choose a valid stage.'); patch.stage = value.stage; }
  if (value.closedReason !== undefined) {
    if (value.closedReason !== null && !isClosedReason(value.closedReason)) throw new ApplicationInputError('closedReason', 'Choose why this application is closed.');
    patch.closedReason = value.closedReason as ClosedReason | null;
  }
  if (patch.stage === 'closed' && !patch.closedReason) throw new ApplicationInputError('closedReason', 'Choose why this application is closed.');
  if (value.appliedOn !== undefined) {
    if (value.appliedOn !== null && !isIsoDay(value.appliedOn)) throw new ApplicationInputError('appliedOn', 'Applied date is not a valid date.');
    patch.appliedOn = value.appliedOn as string | null;
  }
  if (value.nextAction !== undefined) { if (!text(value.nextAction, APPLICATION_LIMITS.nextAction)) throw new ApplicationInputError('nextAction', 'Next action is too long.'); patch.nextAction = value.nextAction.trim(); }
  if (value.nextActionDue !== undefined) {
    if (value.nextActionDue !== null && !timestamp(value.nextActionDue)) throw new ApplicationInputError('nextActionDue', 'Next action date is not valid.');
    patch.nextActionDue = value.nextActionDue as string | null;
  }
  for (const [key, max] of [['notes', APPLICATION_LIMITS.notes], ['contactName', APPLICATION_LIMITS.contactName], ['contactDetails', APPLICATION_LIMITS.contactDetails]] as const) {
    if (value[key] !== undefined) { if (!text(value[key], max)) throw new ApplicationInputError(key, 'A field is too long.'); patch[key] = value[key] as string; }
  }
  if (!Object.keys(patch).length) throw new ApplicationInputError('patch', 'Nothing to update.');
  return patch;
}

/** Strict parse of a stored application row returned by the server. */
export function parseApplicationRecord(value: unknown): ApplicationRecord | null {
  if (!record(value) || typeof value.savedJobId !== 'string' || !UUID.test(value.savedJobId) || !isStage(value.stage)
    || (value.closedReason !== null && !isClosedReason(value.closedReason)) || (value.priorStage !== null && !isStage(value.priorStage))
    || (value.appliedOn !== null && !isIsoDay(value.appliedOn)) || typeof value.nextAction !== 'string'
    || (value.nextActionDue !== null && !timestamp(value.nextActionDue)) || typeof value.notes !== 'string'
    || typeof value.contactName !== 'string' || typeof value.contactDetails !== 'string'
    || typeof value.origin !== 'string' || !(ORIGINS as readonly string[]).includes(value.origin)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !timestamp(value.createdAt) || !timestamp(value.updatedAt)
    || !Array.isArray(value.events) || value.events.length > 200 || !Array.isArray(value.documents) || value.documents.length > 20) return null;
  const events = value.events.filter((event): event is ApplicationEvent => record(event) && typeof event.kind === 'string'
    && ['created', 'stage_changed', 'next_action', 'document_attached', 'imported'].includes(event.kind)
    && (event.fromStage === null || isStage(event.fromStage)) && (event.toStage === null || isStage(event.toStage))
    && (event.closedReason === null || isClosedReason(event.closedReason))
    && typeof event.origin === 'string' && (ORIGINS as readonly string[]).includes(event.origin) && timestamp(event.occurredAt));
  const documents = value.documents.filter((doc): doc is ApplicationDocument => record(doc) && typeof doc.id === 'string' && UUID.test(doc.id)
    && (doc.format === 'pdf' || doc.format === 'docx') && typeof doc.template === 'string' && (doc.sourceKind === 'master' || doc.sourceKind === 'job_version')
    && (doc.jobResumeVersionId === null || (typeof doc.jobResumeVersionId === 'string' && UUID.test(doc.jobResumeVersionId)))
    && timestamp(doc.exportedAt) && (doc.submittedAt === null || timestamp(doc.submittedAt)));
  // The stored default for "no edits" is `{}`; only a complete, well-formed shape is kept.
  const raw = value.requirementEdits;
  const requirementEdits = record(raw) && Array.isArray(raw.removed) && raw.removed.every(id => typeof id === 'string')
    && record(raw.categories) && Array.isArray(raw.added) && raw.added.every(item => record(item) && typeof item.text === 'string' && typeof item.category === 'string')
    ? raw as unknown as RequirementEdits : undefined;
  return { ...(value as unknown as ApplicationRecord), events, documents, requirementEdits };
}

/** Local calendar day (YYYY-MM-DD) in the viewer's time zone. */
export function localDay(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
