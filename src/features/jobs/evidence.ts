/** Extracts only the resume fields needed for deterministic job-search ranking —
 * headline, skills, and past role titles/descriptions — and deliberately leaves out
 * every contact field (name, email, phone, website, location) and entry
 * organization/location/dates. This is the exact shape POSTed to /api/jobs-search; that
 * server route never forwards any of it to Techmap (see server/jobs/handler.ts). */
import { isExperienceSection, type Resume } from '../../model';

export type ResumeEvidence = {
  headline: string;
  summary: string;
  skills: string;
  roles: { title: string; description: string; dates: string }[];
  qualifications: { section: string; title: string; description: string }[];
};

export function buildResumeEvidence(resume: Resume): ResumeEvidence {
  const roles = resume.sections
    .filter(isExperienceSection)
    .flatMap(section => section.entries)
    .filter(entry => entry.title.trim())
    .map(entry => ({ title: entry.title, description: entry.description, dates: entry.dates }));
  const qualifications = resume.sections
    .filter(section => !isExperienceSection(section))
    .flatMap(section => section.entries.map(entry => ({ section: section.title, title: entry.title, description: entry.description })))
    .filter(item => item.title.trim() || item.description.trim());
  return { headline: resume.headline, summary: resume.summary, skills: resume.skills, roles, qualifications };
}

export type SearchProposal = { label: string; title: string };

/** Resume-derived, editable search proposals: the target headline first (so a future
 * direction is always offered, not only what the person has already done), then each
 * distinct past role title. Every proposal is just a starting point the user can edit
 * before searching — never used to silently constrain results to past roles only. */
export function proposeSearchesFromResume(resume: Resume): SearchProposal[] {
  const proposals: SearchProposal[] = [];
  const seen = new Set<string>();
  const add = (label: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    proposals.push({ label, title: trimmed });
  };
  add('Your target title', resume.headline);
  for (const section of resume.sections) {
    if (!isExperienceSection(section)) continue;
    for (const entry of section.entries) add(`Based on past role: ${entry.title}`, entry.title);
  }
  return proposals.slice(0, 6);
}
