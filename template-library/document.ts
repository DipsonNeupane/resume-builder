// Normalizes the Builder's Resume (src/model.ts) into a structured, read-only view
// for Premium renderers. Pure and deterministic: it never invents content and never
// drops any — every non-empty field of the Resume is present in the result.
import { isExperienceSection, type Entry, type Resume, type Section } from '../src/model';

export type Role =
 | 'experience' | 'education' | 'projects' | 'publications' | 'presentations' | 'certifications'
 | 'awards' | 'teaching' | 'leadership' | 'volunteering' | 'other';
export type Segment = { text: string; href?: string };
export type Meta = { label: string; key: string; value: string; href?: string };
export type DocEntry = {
 id: string; title: string; organization: string; location: string; dates: string;
 /** Detail lines with a leading bullet glyph removed. */
 bullets: string[];
 /** Recognised "Label: value" detail lines (Stack:, Link:, DOI: …), in original order. */
 meta: Meta[];
 /** True when the entry has only headline fields (no bullets, no meta). */
 short: boolean;
};
export type DocSection = { id: string; title: string; role: Role; entries: DocEntry[] };
export type SkillGroup = { label: string | null; items: string[] };
export type Contact = { kind: 'email' | 'phone' | 'location' | 'website'; text: string; href?: string };
export type ResumeDoc = {
 name: string; headline: string; contacts: Contact[];
 summary: { heading: string; paragraphs: string[]; bullets: string[] } | null;
 skills: { heading: string; groups: SkillGroup[] } | null;
 sections: DocSection[];
 accent: string; direction: 'ltr' | 'rtl'; language: string; paper: 'A4' | 'Letter';
};

const bulletGlyph = /^[•●▪◦\-–*]\s*/;
const lines = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);

const roleRules: [Role, RegExp][] = [
 ['publications', /publication|papers?\b|journal|preprint|patent|bibliograph/i],
 ['presentations', /presentation|talks?\b|conference|invited|lecture|poster/i],
 ['projects', /project|portfolio|selected work|case stud|open[- ]source|work samples?/i],
 ['certifications', /certif|licen[cs]|credential|accredit|admission|registration/i],
 ['awards', /award|honou?r|grant|fellowship|scholarship|prize|recognition|funding/i],
 ['teaching', /teaching|courses? taught|instruction/i],
 ['education', /education|academic background|degrees?|qualification|training|schooling/i],
 ['leadership', /board|advisory|leadership|governance|non-executive|appointments/i],
 ['volunteering', /volunteer|community|service|pro bono|activities|extracurricular/i],
];
export function sectionRole(section: Section): Role {
 if (isExperienceSection(section)) return 'experience';
 const rule = roleRules.find(([, pattern]) => pattern.test(section.title));
 if (rule) return rule[0];
 return /experience|employment|career|positions|work history/i.test(section.title) ? 'experience' : 'other';
}

// Only these labels are lifted out of details; everything else stays a bullet.
const metaKeys: Record<string, string> = {
 stack: 'stack', 'tech stack': 'stack', tech: 'stack', technologies: 'stack', tools: 'stack', methods: 'methods',
 link: 'link', links: 'link', url: 'link', repo: 'link', repository: 'link', demo: 'link', website: 'link', portfolio: 'link',
 doi: 'doi', authors: 'authors', 'co-authors': 'authors', role: 'role', client: 'client', scope: 'scope', outcome: 'outcome',
};
const metaPattern = /^([A-Za-z][A-Za-z -]{0,18}):\s+(.+)$/;

// URLs: explicit protocol or www. anywhere; bare domains only with a common TLD
// followed by a path, so "Node.js" or "ASP.NET/C#" never become links.
const tlds = 'com|org|net|io|dev|app|co|me|ai|edu|gov|ac|uk|de|fr|ca|au|in|jp|nl|se|no|es|it|ch|info|xyz|page|site|design|tech|us|eu|ly|to|sh|so|studio|pro|health|law|science|academy';
const urlPattern = new RegExp(`\\b(?:https?:\\/\\/[^\\s<>"]+|www\\.[^\\s<>"]+|(?:[a-z0-9-]+\\.)+(?:${tlds})\\/[^\\s<>"]*)`, 'gi');
const trailing = /[.,;:!?)\]}'"]+$/;
export function safeHref(raw: string): string | undefined {
 const value = raw.trim();
 if (!value || /\s/.test(value)) return undefined;
 if (/^doi:/i.test(value) || /^10\.\d{4,9}\//.test(value)) return `https://doi.org/${value.replace(/^doi:\s*/i, '')}`;
 try {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return undefined;
  return url.href;
 } catch { return undefined; }
}
/** Splits text into plain and link segments; link text stays exactly as the user typed it. */
export function linkify(text: string): Segment[] {
 const out: Segment[] = [];
 let last = 0;
 for (const match of text.matchAll(urlPattern)) {
  let url = match[0];
  const strip = url.match(trailing)?.[0] ?? '';
  // Keep a closing paren that belongs to the URL, e.g. wiki/Foo_(bar)
  if (strip.startsWith(')') && url.includes('(')) url = url.slice(0, url.length - strip.length + 1);
  else url = url.slice(0, url.length - strip.length);
  const start = match.index!;
  // Bare domains must be lowercase so product names like "ASP.NET/C#" stay text.
  const bare = !/^(?:https?:\/\/|www\.)/i.test(url);
  const href = bare && /[A-Z]/.test(url.split('/')[0]) ? undefined : safeHref(url);
  if (!href) continue;
  if (start > last) out.push({ text: text.slice(last, start) });
  out.push({ text: url, href });
  last = start + url.length;
 }
 if (last < text.length) out.push({ text: text.slice(last) });
 return out.length ? out : [{ text }];
}
/** Display form of a URL: protocol and trailing slash removed. Never shortens the path. */
export const displayUrl = (value: string) => value.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

function toEntry(item: Entry): DocEntry {
 const bullets: string[] = [];
 const meta: Meta[] = [];
 for (const raw of lines(item.description)) {
  const line = raw.replace(bulletGlyph, '');
  const match = line.match(metaPattern);
  const key = match ? metaKeys[match[1].trim().toLowerCase()] : undefined;
  if (match && key) {
   const value = match[2].trim();
   meta.push({ label: match[1].trim(), key, value, href: key === 'link' || key === 'doi' ? safeHref(key === 'doi' && !/^https?:/i.test(value) ? `doi:${value}` : value) : undefined });
  } else if (line) bullets.push(line);
 }
 return { id: item.id, title: item.title.trim(), organization: item.organization.trim(), location: item.location.trim(), dates: item.dates.trim(), bullets, meta, short: !bullets.length && !meta.length };
}
const hasContent = (e: DocEntry) => Boolean(e.title || e.organization || e.location || e.dates || e.bullets.length || e.meta.length);

/** Splits a list on , ; • · | ، — but never inside parentheses or brackets. */
export function splitList(value: string): string[] {
 const items: string[] = [];
 let depth = 0, current = '';
 for (const char of value) {
  if ('([{'.includes(char)) depth++;
  else if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
  if (depth === 0 && ',;•·|،'.includes(char)) { items.push(current); current = ''; } else current += char;
 }
 items.push(current);
 return items.map(item => item.trim()).filter(Boolean);
}

export function parseSkills(value: string): SkillGroup[] {
 const groups: SkillGroup[] = [];
 for (const line of lines(value)) {
  const clean = line.replace(bulletGlyph, '');
  const grouped = clean.match(/^([^:,;]{1,40}):\s*(.+)$/);
  const items = splitList(grouped ? grouped[2] : clean);
  if (!items.length) continue;
  const label = grouped ? grouped[1].trim() : null;
  const previous = groups[groups.length - 1];
  if (!label && previous && previous.label === null) previous.items.push(...items);
  else groups.push({ label, items });
 }
 return groups;
}

export function toDocument(resume: Resume): ResumeDoc {
 const summaryLines = lines(resume.summary);
 const summaryIsList = summaryLines.length > 1 && summaryLines.every(line => bulletGlyph.test(line));
 const website = resume.website.trim();
 const contacts: Contact[] = [];
 if (resume.email.trim()) contacts.push({ kind: 'email', text: resume.email.trim(), href: `mailto:${resume.email.trim()}` });
 if (resume.phone.trim()) contacts.push({ kind: 'phone', text: resume.phone.trim(), href: `tel:${resume.phone.replace(/[^\d+]/g, '')}` });
 if (resume.location.trim()) contacts.push({ kind: 'location', text: resume.location.trim() });
 if (website) { const href = safeHref(website); contacts.push({ kind: 'website', text: href ? displayUrl(website) : website, href }); }
 const groups = parseSkills(resume.skills);
 return {
  name: resume.name.trim() || 'Your name',
  headline: resume.headline.trim(),
  contacts,
  summary: summaryLines.length ? {
   heading: resume.profileHeading || 'Profile',
   paragraphs: summaryIsList ? [] : summaryLines,
   bullets: summaryIsList ? summaryLines.map(line => line.replace(bulletGlyph, '')) : [],
  } : null,
  skills: groups.length ? { heading: resume.skillsHeading || 'Skills & languages', groups } : null,
  sections: resume.sections
   .map(section => ({ id: section.id, title: section.title.trim() || 'Untitled section', role: sectionRole(section), entries: section.entries.map(toEntry).filter(hasContent) }))
   .filter(section => section.entries.length),
  accent: resume.accent, direction: resume.direction, language: resume.language, paper: resume.paper,
 };
}

/** Stable reorder: sections whose role appears in `order` come first in that order; the rest keep user order after them. */
export function orderSections(sections: DocSection[], order: Role[]): DocSection[] {
 const rank = (s: DocSection) => { const i = order.indexOf(s.role); return i === -1 ? order.length : i; };
 return sections.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(({ s }) => s);
}

/** Groups consecutive entries that share an organization (case-insensitive). */
export function groupByOrganization(entries: DocEntry[]): { organization: string; location: string; entries: DocEntry[] }[] {
 const groups: { organization: string; location: string; entries: DocEntry[] }[] = [];
 for (const entry of entries) {
  const last = groups[groups.length - 1];
  if (last && entry.organization && last.organization.toLowerCase() === entry.organization.toLowerCase()) last.entries.push(entry);
  else groups.push({ organization: entry.organization, location: entry.location, entries: [entry] });
 }
 return groups;
}

/**
 * Answer-first lead-in: text before the first ": " or " — " / " – " when it is a
 * short phrase (≤ 7 words). Returns null when the line has no such lead-in.
 */
export function leadIn(line: string): { lead: string; rest: string } | null {
 const match = line.match(/^(.{2,70}?)(:\s+|\s+[—–]\s+)(.+)$/);
 if (!match || match[1].trim().split(/\s+/).length > 7 || /https?:\/\/|www\./i.test(match[1])) return null;
 return { lead: match[1] + match[2].trimEnd(), rest: match[3] };
}

// Figures worth scanning: currency amounts, percentages, multipliers, magnitudes and
// plain counts ≥ 2 digits. Bare four-digit years are left alone.
const figurePattern = /(?:[$£€¥₹]\s?\d[\d,.]*\s?(?:k|K|m|M|bn|B|million|billion)?|\d[\d,.]*\s?(?:%|x\b|×|k\b|K\b|M\b|bn\b|B\b|million\b|billion\b|pp\b|bps\b)|\b\d{1,3}(?:,\d{3})+\b|\b(?!(?:19|20)\d{2}\b)\d{2,}(?:\.\d+)?\b)/g;
/** Splits text into plain and figure segments (only used for emphasis; text is unchanged). */
export function figures(text: string): { text: string; figure: boolean }[] {
 const out: { text: string; figure: boolean }[] = [];
 let last = 0;
 for (const match of text.matchAll(figurePattern)) {
  const start = match.index!;
  if (start > last) out.push({ text: text.slice(last, start), figure: false });
  out.push({ text: match[0], figure: true });
  last = start + match[0].length;
 }
 if (last < text.length) out.push({ text: text.slice(last), figure: false });
 return out;
}

/** The user's own skill items that literally appear in an entry's text. Never inferred. */
export function skillsInEntry(entry: DocEntry, skills: SkillGroup[] | undefined): string[] {
 if (!skills) return [];
 const haystack = ` ${[entry.title, entry.organization, ...entry.bullets, ...entry.meta.map(m => m.value)].join(' ').toLowerCase()} `;
 const seen = new Set<string>();
 return skills.flatMap(g => g.items).filter(item => {
  const needle = item.toLowerCase().trim();
  if (needle.length < 2 || seen.has(needle)) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(haystack);
  if (found) seen.add(needle);
  return found;
 });
}

/** True when a project's organization/title names the employer (for nesting shipped work under roles). */
export function namesEmployer(project: DocEntry, employer: string): boolean {
 const name = employer.trim().toLowerCase();
 if (name.length < 3) return false;
 const text = `${project.organization} ${project.location}`.toLowerCase();
 const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(text);
}
