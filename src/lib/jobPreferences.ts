/** Soft discovery preferences: experience level and priorities.
 *
 * Shared by server ranking (server/jobs/handler.ts) and the Discover cards, so the order
 * a person sees and the reasons shown for it come from the same rules. Only explicit
 * posting fields are read: the title, the structured workplace / employment type /
 * salary, and an explicit "N years" statement in the description. Anything a posting
 * does not state is reported as unknown and never adds or subtracts score.
 *
 * Soft preferences only reorder results. Hard constraints (dealbreakers, employment
 * type, salary and location filters) are applied elsewhere and are the only rules that
 * hide a posting. Neither is ever evidence of qualification. */

export const EXPERIENCE_LEVELS = ['entry', 'mid', 'senior', 'lead', 'unsure'] as const;
/** Only priorities a posting can state in structured data. Progression, learning and
 * impact were removed from setup: postings do not state them reliably. */
export const PRIORITIES = ['flexibility', 'stability', 'pay'] as const;
export type ExperienceLevel = typeof EXPERIENCE_LEVELS[number];
export type Priority = typeof PRIORITIES[number];
export type PostingLevel = Exclude<ExperienceLevel, 'unsure'>;

export type PreferencePosting = {
  title: string;
  descriptionText?: string | null;
  workplace: string | null;
  employmentType: string | null;
  salary: { min: number; max: number; currency: string; period: string } | null;
};
export type SoftPreferences = { experienceLevel?: ExperienceLevel; priorities?: readonly Priority[] };
export type PreferenceSignals = { score: number; fits: string[]; mismatches: string[]; unknown: string[] };

const ORDER: PostingLevel[] = ['entry', 'mid', 'senior', 'lead'];
const LEVEL_LABEL: Record<PostingLevel, string> = { entry: 'entry level', mid: 'mid level', senior: 'senior', lead: 'lead' };
const LEAD_TITLE = /\b(lead|principal|head of|director|chief|vp|vice president)\b/i;
const SENIOR_TITLE = /\b(senior|sr\.?|staff)\b/i;
const ENTRY_TITLE = /\b(junior|jr\.?|entry[- ]level|intern(ship)?|trainee|graduate|apprentice(ship)?)\b/i;
// "3+ years", "3-5 years", "at least 2 years of experience". The lower bound is used.
const YEARS = /\b(?:at least |minimum (?:of )?)?(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?(?:years?|yrs?)\b(?:[^.\n]{0,40}\bexperience\b)?/i;

/** The level a posting states, with the wording it is based on, or null when unstated. */
export function postingLevel(posting: Pick<PreferencePosting, 'title' | 'descriptionText'>): { level: PostingLevel; basis: string } | null {
  const title = posting.title ?? '';
  for (const [pattern, level] of [[LEAD_TITLE, 'lead'], [SENIOR_TITLE, 'senior'], [ENTRY_TITLE, 'entry']] as const) {
    const found = title.match(pattern);
    if (found) return { level, basis: `the title says “${found[0]}”` };
  }
  const years = (posting.descriptionText ?? '').match(YEARS);
  if (years && /experience/i.test(years[0])) {
    const value = Number(years[1]);
    const level: PostingLevel = value <= 1 ? 'entry' : value <= 4 ? 'mid' : 'senior';
    return { level, basis: `the posting asks for ${value}+ years` };
  }
  return null;
}

export function preferenceSignals(posting: PreferencePosting, preferences: SoftPreferences): PreferenceSignals {
  const out: PreferenceSignals = { score: 0, fits: [], mismatches: [], unknown: [] };
  const wanted = preferences.experienceLevel;
  if (wanted && wanted !== 'unsure') {
    const stated = postingLevel(posting);
    if (!stated) out.unknown.push('seniority');
    else {
      const gap = ORDER.indexOf(stated.level) - ORDER.indexOf(wanted);
      if (gap === 0) { out.score += 12; out.fits.push(`Looks ${LEVEL_LABEL[stated.level]}, as you chose (${stated.basis})`); }
      else { out.score -= 8 * Math.abs(gap); out.mismatches.push(`Looks ${gap > 0 ? 'more' : 'less'} senior than ${LEVEL_LABEL[wanted]} (${stated.basis})`); }
    }
  }
  const priorities = new Set(preferences.priorities ?? []);
  if (priorities.has('flexibility')) {
    if (posting.workplace === 'remote' || posting.workplace === 'hybrid') { out.score += 6; out.fits.push(`${posting.workplace === 'remote' ? 'Remote' : 'Hybrid'} — matches your flexibility priority`); }
    else if (posting.workplace === 'onsite' || posting.workplace === 'field') { out.score -= 4; out.mismatches.push('Listed as on-site, less flexible'); }
    else out.unknown.push('work arrangement');
  }
  if (priorities.has('stability')) {
    if (posting.employmentType === 'full_time') { out.score += 6; out.fits.push('Full-time — matches your stability priority'); }
    else if (posting.employmentType === 'contract' || posting.employmentType === 'temporary') { out.score -= 4; out.mismatches.push('Listed as contract or temporary'); }
    else if (!posting.employmentType || posting.employmentType === 'unknown') out.unknown.push('employment type');
  }
  if (priorities.has('pay')) {
    if (posting.salary) { out.score += 6; out.fits.push('Pay is stated in the posting'); }
    else out.unknown.push('pay');
  }
  return out;
}
