// Template library registry: the single metadata source for every resume template,
// Free and Premium. Adding a template = one entry here (+ a renderer and stylesheet
// for Premium). Browsers, labs and pickers read this list; nothing else should
// hard-code template names, families or counts.
//
// PREMIUM is registry metadata, not an authorization decision. Pricing and
// access are enforced by the server-owned billing catalog and entitlement layer.
import { freeTemplates, type FreeTemplateId as TemplateId, type PremiumTemplateId } from '../src/model';

export type Tier = 'free' | 'premium';
// live: shipped in the Builder. prototype/planned remain available for future work.
export type Status = 'live' | 'prototype' | 'planned';
export type Family =
 | 'executive' | 'technical' | 'portfolio' | 'academic' | 'traditional' | 'clinical'
 | 'modern' | 'compact' | 'early-career' | 'consulting' | 'data' | 'operations' | 'product' | 'general';
export type Density = 'airy' | 'standard' | 'compact' | 'dense';
// Factual, verifiable characteristics only. Never outcome claims (no "ATS optimized").
export type Fact =
 | 'single-column' | 'single-reading-order' | 'hanging-headings' | 'date-rail' | 'timeline'
 | 'projects-first' | 'skills-first' | 'education-first' | 'research-first' | 'credentials-first'
 | 'employer-grouped' | 'career-overview' | 'case-study-cards' | 'numbered-publications'
 | 'high-density' | 'monochrome' | 'serif' | 'sans' | 'monospace-details' | 'multi-page-friendly' | 'one-page-oriented';

export type PremiumId = PremiumTemplateId;
export type LibraryId = TemplateId | PremiumId;

export interface TemplateMeta {
 id: LibraryId;
 name: string;
 tier: Tier;
 status: Status;
 family: Family;
 /** ISO date the template became available to users. null until released. Drives NEW. */
 releasedAt: string | null;
 /** Release cohort (e.g. '2026-11') so batches of ~5 can ship together. */
 cohort?: string;
 useCase: string;
 structure: string;
 typography: string;
 density: Density;
 sectionOrder: string;
 distinctFrom: string;
 whyChoose: string;
 facts: Fact[];
}

const free: Record<TemplateId, Omit<TemplateMeta, 'id' | 'name' | 'tier' | 'status' | 'releasedAt' | 'distinctFrom' | 'whyChoose'>> = {
 modern: { family: 'general', useCase: 'General purpose.', structure: 'Shared single-column flow; accent rule under header, pill contacts.', typography: 'Noto Sans.', density: 'standard', sectionOrder: 'Profile → sections in user order → Skills last', facts: ['single-column', 'sans'] },
 classic: { family: 'traditional', useCase: 'Conservative applications.', structure: 'Shared flow; centered header and centered headings.', typography: 'Georgia (falls back to Noto Sans where Georgia is unavailable).', density: 'standard', sectionOrder: 'Profile → sections in user order → Skills last', facts: ['single-column', 'serif'] },
 minimal: { family: 'general', useCase: 'Understated general purpose.', structure: 'Shared flow; no header rule, quiet headings.', typography: 'Noto Sans, light weights.', density: 'airy', sectionOrder: 'Profile → sections in user order → Skills last', facts: ['single-column', 'sans'] },
 compact: { family: 'compact', useCase: 'Longer content on fewer pages.', structure: 'Shared flow with reduced spacing.', typography: 'Noto Sans.', density: 'compact', sectionOrder: 'Profile → sections in user order → Skills last', facts: ['single-column', 'sans'] },
 bold: { family: 'general', useCase: 'Visible header presence.', structure: 'Shared flow; filled accent header band.', typography: 'Noto Sans.', density: 'standard', sectionOrder: 'Profile → sections in user order → Skills last', facts: ['single-column', 'sans'] },
 executive: { family: 'executive', useCase: 'Senior roles.', structure: 'Shared flow; double rule header, left-barred headings.', typography: 'Noto Sans.', density: 'standard', sectionOrder: 'Profile → sections in user order → Skills last', facts: ['single-column', 'sans'] },
 ledger: { family: 'general', useCase: 'Structured general purpose.', structure: 'Shared flow; split header, tinted heading bands, dashed entry rules.', typography: 'Noto Sans.', density: 'standard', sectionOrder: 'Profile → sections in user order → Skills last', facts: ['single-column', 'sans'] },
};

const freeMeta: TemplateMeta[] = freeTemplates.map(t => ({
 id: t.id, name: t.label, tier: 'free', status: 'live', releasedAt: null,
 distinctFrom: '—', whyChoose: t.tagline, ...free[t.id],
}));

const premium = (meta: Omit<TemplateMeta, 'tier' | 'releasedAt'> & { id: PremiumId }): TemplateMeta => ({ tier: 'premium', releasedAt: null, ...meta, status: 'live' });

const premiumMeta: TemplateMeta[] = [
 premium({ id: 'boardroom', name: 'Boardroom', status: 'prototype', family: 'executive',
  useCase: 'Directors, VPs and C-level leaders whose story is scope, progression and remit.',
  structure: 'Split header (identity left, contact stack right). Summary set as a serif lede — or, when written as a list, a numbered highlights grid. Areas of expertise directly under the summary. Experience is employer-first: consecutive roles at the same organization are grouped beneath one employer heading.',
  typography: 'Newsreader for name, lede and employers; Source Sans 3 for roles, bullets and metadata.',
  density: 'standard', sectionOrder: 'Summary → Expertise → Experience → Board/Leadership → Education → Certifications → Other',
  distinctFrom: 'Free Executive only restyles headings on the shared flow. Boardroom changes the hierarchy: employer over title, grouped progression, expertise moved to the top.',
  whyChoose: 'Multiple roles at one employer and breadth of remit read as one progression rather than repeated headings.',
  facts: ['single-reading-order', 'employer-grouped', 'skills-first', 'serif', 'multi-page-friendly'] }),
 premium({ id: 'mandate', name: 'Mandate', status: 'prototype', family: 'executive',
  useCase: 'Board members, non-executive directors, interim and fractional executives with parallel appointments.',
  structure: 'A one-line-per-role career overview on page one, then board and advisory appointments, then full role detail. Overview first, evidence second.',
  typography: 'Newsreader throughout with tabular lining figures; small-caps labels.',
  density: 'standard', sectionOrder: 'Profile → Career overview → Board & advisory → Experience detail → Education → Affiliations',
  distinctFrom: 'None of the seven summarise the career before detailing it, or present concurrent appointments as a portfolio.',
  whyChoose: 'Overlapping appointments read as a deliberate portfolio instead of a confusing chronology.',
  facts: ['single-column', 'career-overview', 'serif', 'multi-page-friendly'] }),
 premium({ id: 'stackline', name: 'Stackline', status: 'prototype', family: 'technical',
  useCase: 'Software, platform and ML engineers; open-source contributors; bootcamp graduates whose projects carry weight.',
  structure: 'Grouped stack matrix directly under the header. Project sections promoted above experience. "Stack:" and "Link:" detail lines lifted into a monospaced metadata line per entry; URLs become short clickable links.',
  typography: 'IBM Plex Sans for text; IBM Plex Mono for headings, dates, stacks and links.',
  density: 'compact', sectionOrder: 'Summary → Stack → Projects → Experience → Education → Certifications → Other',
  distinctFrom: 'All seven put skills last as one comma paragraph and treat projects as a generic section. Stackline makes the stack and shipped work the first read.',
  whyChoose: 'When what you built — and with what — is the strongest evidence.',
  facts: ['single-column', 'projects-first', 'skills-first', 'monospace-details', 'sans'] }),
 premium({ id: 'kernel', name: 'Kernel', status: 'prototype', family: 'technical',
  useCase: 'Senior, staff and principal engineers, SREs and architects with long, systems-heavy experience.',
  structure: 'Specification-style: numbered sections, right-aligned date column, per-role stack attribution line, compact three-column key/value skills matrix after the summary. Experience-first.',
  typography: 'IBM Plex Sans with IBM Plex Mono section numbers and stack lines.',
  density: 'compact', sectionOrder: 'Summary → Skills matrix → Experience → Projects → Education',
  distinctFrom: 'Experience-first with per-role stack attribution, unlike Stackline’s projects-first opening.',
  whyChoose: 'Long careers where system scope per role matters more than side projects.',
  facts: ['single-column', 'monospace-details', 'sans', 'multi-page-friendly'] }),
 premium({ id: 'casebook', name: 'Casebook', status: 'prototype', family: 'portfolio',
  useCase: 'Product, UX and brand designers, writers, architects and creative technologists with a portfolio link.',
  structure: 'Editorial header that gives the portfolio link primary weight. Summary set as a statement. Project/"Selected work" sections become a two-up grid of numbered case-study cards (title, role/client, detail, link). Experience condensed after the work; capabilities in columns.',
  typography: 'Instrument Serif display for name, statement and case titles; Instrument Sans for text.',
  density: 'airy', sectionOrder: 'Statement → Selected work → Experience → Capabilities → Education → Other',
  distinctFrom: 'The only template that presents work as case studies rather than a chronology; no free template uses a display serif or card grid.',
  whyChoose: 'When reviewers will click through to your work and the resume should act as its index.',
  facts: ['projects-first', 'case-study-cards', 'serif'] }),
 premium({ id: 'atelier', name: 'Atelier', status: 'prototype', family: 'portfolio',
  useCase: 'Creative, art and design directors; senior agency creatives.',
  structure: 'Asymmetric header — oversized name with headline and contact in a narrow side column. Recognition promoted to page one. Experience led by client/brand with role secondary.',
  typography: 'Newsreader at display optical size (light) for the name and profile, italic Newsreader for roles; Instrument Sans text with tracked labels.',
  density: 'airy', sectionOrder: 'Profile → Recognition → Experience (client-led) → Selected work → Skills → Education',
  distinctFrom: 'Recognition-first and client-led ordering; no free template reorders around awards.',
  whyChoose: 'Creative leadership where clients and recognition establish credibility fastest.',
  facts: ['single-reading-order', 'serif'] }),
 premium({ id: 'scholar', name: 'Scholar', status: 'prototype', family: 'academic',
  useCase: 'PhD candidates, postdocs, faculty and research scientists applying for academic posts.',
  structure: 'Academic CV conventions: date rail for education and appointments, research-first order, publications numbered and formatted as citations (quoted title, italic venue, year) with hanging numbers. Multi-page is expected.',
  typography: 'Newsreader throughout; small-caps section headings; no sans.',
  density: 'standard', sectionOrder: 'Research interests → Education → Appointments → Publications → Grants & awards → Teaching → Presentations → Service → Skills',
  distinctFrom: 'None of the seven order by research, number publications, or format entries as citations.',
  whyChoose: 'Academic reviewers read publication lists like a bibliography, and length is normal.',
  facts: ['single-column', 'research-first', 'numbered-publications', 'date-rail', 'serif', 'multi-page-friendly'] }),
 premium({ id: 'bench', name: 'Bench', status: 'prototype', family: 'academic',
  useCase: 'Industry research scientists, lab and R&D scientists, biotech/pharma, applied ML research.',
  structure: 'Resume/CV hybrid: methods & instrumentation matrix, experience with Methods lines, a selected publications & patents list in citation form.',
  typography: 'Source Sans 3 text with Newsreader citations.',
  density: 'compact', sectionOrder: 'Summary → Methods → Experience → Selected publications & patents → Education → Certifications',
  distinctFrom: 'Sits between Scholar (full CV) and Stackline (software): scientific methods and selected output, industry length.',
  whyChoose: 'Research careers moving between academia and industry.',
  facts: ['single-column', 'numbered-publications', 'sans', 'serif'] }),
 premium({ id: 'charter', name: 'Charter', status: 'prototype', family: 'traditional',
  useCase: 'Lawyers, bankers, accountants, audit and compliance professionals.',
  structure: 'Centered traditional header; admissions/licences block immediately beneath; ruled small-caps register headings; organizations in small caps; deal/matter lines supported.',
  typography: 'Newsreader with small caps and tabular lining figures.',
  density: 'standard', sectionOrder: 'Admissions & licences → Education → Experience → Selected matters → Affiliations',
  distinctFrom: 'Classic centres the shared flow; Charter elevates credentials and uses a register-style hierarchy.',
  whyChoose: 'Conservative reviewers who first confirm qualifications and admissions.',
  facts: ['single-column', 'credentials-first', 'serif', 'monochrome'] }),
 premium({ id: 'rounds', name: 'Rounds', status: 'prototype', family: 'clinical',
  useCase: 'Nurses, physicians, pharmacists, therapists and allied health professionals.',
  structure: 'Licensure & certification table near the top (credential · issuer/number · dates). Clinical experience emphasises setting and unit. Clinical training in compact rows.',
  typography: 'Source Sans 3 with tabular numerals.',
  density: 'compact', sectionOrder: 'Summary → Licensure & certification → Clinical experience → Education → Clinical training → Skills → Memberships',
  distinctFrom: 'Credential verification first with tabular licensure; none of the seven treat licences specially.',
  whyChoose: 'Clinical hiring typically begins with licence and certification checks.',
  facts: ['single-column', 'credentials-first', 'sans'] }),
 premium({ id: 'meridian', name: 'Meridian', status: 'prototype', family: 'modern',
  useCase: 'Mid-career professionals in marketing, operations, product, sales, people and general business roles.',
  structure: 'Hanging headings: section labels sit in a start-side rail beside their content; the header mirrors the rail with contact details stacked in it. Body text stays a single reading column.',
  typography: 'Instrument Sans throughout; hierarchy by weight and size contrast.',
  density: 'standard', sectionOrder: 'Profile → Skills → sections in user order',
  distinctFrom: 'Every free template stacks headings above content; Meridian’s rail turns section labels into a scannable index down the page.',
  whyChoose: 'A contemporary, structured document without splitting content into two columns.',
  facts: ['hanging-headings', 'single-reading-order', 'sans'] }),
 premium({ id: 'crossover', name: 'Crossover', status: 'prototype', family: 'modern',
  useCase: 'Career changers and generalists whose transferable skills need connecting to past roles.',
  structure: 'Key strengths band under the summary; each role lists which of your stated skills appear in its text ("skills in context"). Only matches your own words — nothing is inferred.',
  typography: 'Source Sans 3.',
  density: 'standard', sectionOrder: 'Summary → Key strengths → Experience → Education → Other',
  distinctFrom: 'Skills integrated into experience rather than isolated at the end.',
  whyChoose: 'Showing where a skill was used, not just that you have it.',
  facts: ['single-column', 'skills-first', 'sans'] }),
 premium({ id: 'almanac', name: 'Almanac', status: 'prototype', family: 'compact',
  useCase: 'Experienced candidates fitting 10–20 years onto one or two pages; contractors with many roles.',
  structure: 'Date rail with run-in title · organization lines, tight hanging bullets, short entries (no details) set two-up, skills as a run-in grouped paragraph. Re-architected lines, not just reduced spacing.',
  typography: 'IBM Plex Sans Condensed for names, labels and dates; Source Sans 3 for text; 9pt base.',
  density: 'dense', sectionOrder: 'Summary → Skills → sections in user order',
  distinctFrom: 'Free Compact tightens spacing on the same layout; Almanac changes line architecture to recover vertical space.',
  whyChoose: 'Lots of real content and a hard page budget.',
  facts: ['date-rail', 'high-density', 'sans', 'one-page-oriented'] }),
 premium({ id: 'roster', name: 'Roster', status: 'prototype', family: 'compact',
  useCase: 'Freelancers, consultants, contractors, locum and agency workers with many short engagements.',
  structure: 'Engagements as table-like rows (client · role · dates) with one outcome line each; long-term roles keep full bullets.',
  typography: 'IBM Plex Sans with tabular figures.',
  density: 'dense', sectionOrder: 'Summary → Skills → Engagements → Experience → Education',
  distinctFrom: 'Row-based engagement listing; no free template handles many short roles specially.',
  whyChoose: 'Twenty short engagements read as a body of work instead of twenty headings.',
  facts: ['high-density', 'sans'] }),
 premium({ id: 'primer', name: 'Primer', status: 'prototype', family: 'early-career',
  useCase: 'Students, graduates, apprentices and first-job applicants.',
  structure: 'Education first with coursework/honours lines; projects and activities weighted equally with experience; handles “no experience yet” without empty sections.',
  typography: 'Newsreader name; Source Sans 3 text.',
  density: 'airy', sectionOrder: 'Summary → Education → Projects → Experience → Activities & volunteering → Skills',
  distinctFrom: 'None of the seven reorder for early career.',
  whyChoose: 'Leading with what you have done so far, honestly, on one page.',
  facts: ['single-column', 'education-first', 'one-page-oriented'] }),
 premium({ id: 'pyramid', name: 'Pyramid', status: 'prototype', family: 'consulting',
  useCase: 'Management and strategy consultants, corporate development, MBA candidates, business analysts.',
  structure: 'Answer-first bullets: text before a colon or dash is set as a bold lead-in; figures in tabular numerals; closing run-in “Additional” block (skills, languages, interests).',
  typography: 'Newsreader body; IBM Plex Sans small labels.',
  density: 'compact', sectionOrder: 'Education → Experience → Leadership → Additional',
  distinctFrom: 'Bullet-level typographic structure; none of the seven treat lead-ins or figures.',
  whyChoose: 'Consulting-style bullets where the conclusion is read first.',
  facts: ['single-column', 'education-first', 'serif', 'one-page-oriented'] }),
 premium({ id: 'quartile', name: 'Quartile', status: 'prototype', family: 'data',
  useCase: 'Data analysts and scientists, BI and analytics engineers.',
  structure: 'Figures in bullets (%, currency, multipliers, counts) set in semibold tabular numerals; tools matrix grouped by Languages / Tools / Methods; projects carry dataset and stack lines.',
  typography: 'IBM Plex Sans with tabular numerals; IBM Plex Mono tool names.',
  density: 'compact', sectionOrder: 'Summary → Tools matrix → Experience → Projects → Education',
  distinctFrom: 'Numeric evidence emphasis — no free template treats figures.',
  whyChoose: 'Quantified results are the argument.',
  facts: ['single-column', 'skills-first', 'monospace-details', 'sans'] }),
 premium({ id: 'waypoint', name: 'Waypoint', status: 'prototype', family: 'operations',
  useCase: 'Operations, supply-chain, logistics, facilities and multi-site managers.',
  structure: 'Continuous timeline in the start margin with a node per role; location given equal weight to dates; optional “Scope:” lines (teams, sites, budget) highlighted.',
  typography: 'Source Sans 3 semibold hierarchy.',
  density: 'standard', sectionOrder: 'Summary → Experience timeline → Certifications → Education → Skills',
  distinctFrom: 'Timeline structure; none of the seven show continuity or sites.',
  whyChoose: 'Careers moving across sites and scopes read as a path.',
  facts: ['timeline', 'single-reading-order', 'sans'] }),
 premium({ id: 'cadence', name: 'Cadence', status: 'prototype', family: 'product',
  useCase: 'Product managers, product designers and programme managers.',
  structure: 'Project entries whose organization matches an employer nest under that role as “shipped” callouts; remaining projects appear separately; “Outcome:” lines highlighted.',
  typography: 'Instrument Sans.',
  density: 'standard', sectionOrder: 'Summary → Experience with nested work → Other projects → Skills → Education',
  distinctFrom: 'Work attached to the employer where it was delivered.',
  whyChoose: 'Showing what shipped at each company.',
  facts: ['single-reading-order', 'sans'] }),
 premium({ id: 'plainsong', name: 'Plainsong', status: 'prototype', family: 'traditional',
  useCase: 'Public sector, education, and any application asking for a conservative plain document.',
  structure: 'Monochrome single column with no rules, fills or accent: hierarchy by weight and size only. Minimum ink.',
  typography: 'Newsreader, one restrained scale.',
  density: 'standard', sectionOrder: 'User order',
  distinctFrom: 'Minimal still uses accent and light weights; Plainsong is black-only serif and the most print-literal.',
  whyChoose: 'When decoration of any kind would be a distraction.',
  facts: ['single-column', 'monochrome', 'serif'] }),
];

export const library: readonly TemplateMeta[] = [...freeMeta, ...premiumMeta];
export const templateMeta = (id: LibraryId) => library.find(t => t.id === id);

export type DiscoveryLabel = 'FREE' | 'PREMIUM' | 'NEW' | 'POPULAR';
export const newWindowDays = 45;
/**
 * Factual discovery labels. NEW comes from releasedAt only. POPULAR is shown
 * only for ids supplied from real usage data by the caller — this module never
 * decides popularity or recommendations itself.
 */
export function discoveryLabels(meta: TemplateMeta, context: { now: Date; popularIds?: ReadonlySet<LibraryId> }): DiscoveryLabel[] {
 const labels: DiscoveryLabel[] = [meta.tier === 'free' ? 'FREE' : 'PREMIUM'];
 if (meta.status === 'live' && meta.releasedAt) {
  const age = (context.now.getTime() - Date.parse(meta.releasedAt)) / 86_400_000;
  if (age >= 0 && age <= newWindowDays) labels.push('NEW');
 }
 if (context.popularIds?.has(meta.id)) labels.push('POPULAR');
 return labels;
}
