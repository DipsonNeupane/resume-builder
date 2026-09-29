export type Entry = { id: string; title: string; organization: string; location: string; dates: string; description: string };
export type Section = { kind?: 'experience' | 'optional'; id: string; title: string; entries: Entry[] };
export type FreeTemplateId = 'modern' | 'classic' | 'minimal' | 'compact' | 'bold' | 'executive' | 'ledger';
export type PremiumTemplateId =
 | 'boardroom' | 'mandate' | 'stackline' | 'kernel' | 'casebook' | 'atelier' | 'scholar' | 'bench'
 | 'charter' | 'rounds' | 'meridian' | 'crossover' | 'almanac' | 'roster' | 'primer' | 'pyramid'
 | 'quartile' | 'waypoint' | 'cadence' | 'plainsong';
export type TemplateId = FreeTemplateId | PremiumTemplateId;
export type Resume = { version: 1; name: string; headline: string; email: string; phone: string; location: string; website: string; summary: string; skills: string; profileHeading: string; skillsHeading: string; sections: Section[]; template: TemplateId; paper: 'A4' | 'Letter'; accent: string; direction: 'ltr' | 'rtl'; language: string; noExperience: boolean };
// Single source of truth for template selection: shared by the landing template
// showcase and the in-builder Design & format picker, so the two never drift apart.
// Seven Free and twenty Premium templates share this registry. Server-side
// entitlements remain authoritative for Premium exports and paid download access.
export type TemplateSummary = { id: TemplateId; label: string; tagline: string; tier: 'free' | 'premium'; releasedAt: string | null };
export const freeTemplates: Array<TemplateSummary & { id: FreeTemplateId; tier: 'free' }> = [
 { id: 'modern', label: 'Modern', tagline: 'Clean lines with an accent-led header', tier: 'free', releasedAt: null },
 { id: 'classic', label: 'Classic', tagline: 'Traditional type with balanced spacing', tier: 'free', releasedAt: null },
 { id: 'minimal', label: 'Minimal', tagline: 'Open spacing with quiet section dividers', tier: 'free', releasedAt: null },
 { id: 'compact', label: 'Compact', tagline: 'Tighter spacing for information-rich resumes', tier: 'free', releasedAt: null },
 { id: 'bold', label: 'Bold', tagline: 'High-contrast header and strong section markers', tier: 'free', releasedAt: null },
 { id: 'executive', label: 'Executive', tagline: 'Refined headings with restrained rules', tier: 'free', releasedAt: null },
 { id: 'ledger', label: 'Ledger', tagline: 'Structured bands and detailed section labels', tier: 'free', releasedAt: null },
];
export const premiumTemplates: Array<TemplateSummary & { id: PremiumTemplateId; tier: 'premium' }> = [
 ['boardroom','Boardroom','Employer-grouped progression for senior leadership'],['mandate','Mandate','Career overview for board and fractional leadership'],
 ['stackline','Stackline','Projects and technical stack first'],['kernel','Kernel','Systems-heavy experience with precise structure'],
 ['casebook','Casebook','Selected work presented as editorial case studies'],['atelier','Atelier','Recognition and client-led creative leadership'],
 ['scholar','Scholar','Research-first CV with numbered publications'],['bench','Bench','Methods-forward scientific and research work'],
 ['charter','Charter','Credentials-first traditional register'],['rounds','Rounds','Licensure and clinical setting first'],
 ['meridian','Meridian','Modern hierarchy with hanging section rails'],['crossover','Crossover','Strengths and skills shown in context'],
 ['almanac','Almanac','Dense date-rail layout for long histories'],['roster','Roster','Compact organization and outcome rows'],
 ['primer','Primer','Education and projects first for early careers'],['pyramid','Pyramid','Answer-first consulting accomplishments'],
 ['quartile','Quartile','Data results and tools given clear emphasis'],['waypoint','Waypoint','Continuous operations timeline'],
 ['cadence','Cadence','Product work nested beneath the role that shipped it'],['plainsong','Plainsong','Black-only traditional hierarchy without decoration'],
].map(([id,label,tagline])=>({id:id as PremiumTemplateId,label,tagline,tier:'premium' as const,releasedAt:null}));
export const templates: TemplateSummary[] = [...freeTemplates, ...premiumTemplates];
export const templateIds = templates.map(t => t.id);
export const premiumTemplateIds = premiumTemplates.map(t=>t.id as PremiumTemplateId);
export const isPremiumTemplate = (id: TemplateId): id is PremiumTemplateId => premiumTemplateIds.includes(id as PremiumTemplateId);
export const entry = (): Entry => ({ id: crypto.randomUUID(), title: '', organization: '', location: '', dates: '', description: '' });
export const blank = (): Resume => ({version:1,name:'',headline:'',email:'',phone:'',location:'',website:'',summary:'',skills:'',profileHeading:'Profile',skillsHeading:'Skills & languages',sections:[{id:crypto.randomUUID(),title:'Experience',kind:'experience',entries:[entry()]},{id:crypto.randomUUID(),title:'Education',entries:[entry()]}],template:'modern',paper:'A4',accent:'#20594a',direction:'ltr',language:'en',noExperience:false});
export const example = (): Resume => ({ ...blank(), name:'Alex Morgan', headline:'Customer Experience Specialist',email:'alex.morgan@example.com',phone:'+44 7700 900123',location:'Manchester, United Kingdom',website:'linkedin.com/in/alex-example',summary:'People-first customer experience specialist with a thoughtful approach to solving problems. Experienced in supporting diverse customers, improving everyday processes, and helping teams deliver a consistently welcoming service.',skills:'Customer support, Team collaboration, Problem solving, CRM systems, English, Spanish',sections:[{id:'experience',title:'Experience',kind:'experience',entries:[{id:'role1',title:'Customer Experience Specialist',organization:'Example Company',location:'Manchester, UK',dates:'2022 — Present',description:'Support customers across email, phone, and live chat with clear, empathetic communication.\nPartner with the operations team to simplify common support processes.\nHelp new team members develop product knowledge and confidence.'},{id:'role2',title:'Customer Service Associate',organization:'Sample Retail',location:'Leeds, UK',dates:'2020 — 2022',description:'Helped customers find the right products and resolve order questions.\nMaintained accurate records and coordinated with colleagues during busy periods.'}]},{id:'education',title:'Education',entries:[{id:'degree1',title:'BA Business Management',organization:'Example University',location:'United Kingdom',dates:'2017 — 2020',description:''}]}] });
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const strings = (value: Record<string, unknown>, keys: string[], max = 50000) => keys.every(key => typeof value[key] === 'string' && (value[key] as string).length <= max);
export const languagePattern = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;
// A resume the editor's own per-field/section/entry caps allow can be many megabytes of JSON.
// This is the forward-looking soft ceiling the editor enforces on new growth so a fresh export
// always re-imports; it is intentionally NOT part of isResume so older/legacy drafts that already
// exceed it (saved before this cap existed, or restored from a backup) still load and remain
// exportable/editable-down rather than becoming unreadable.
export const maxContentChars = 200000;
// The hard ceiling importBackup() enforces on file size. Kept well above what maxContentChars can
// produce so any backup the editor can currently export always re-imports, and raised generously
// beyond the old 2,000,000-byte limit so a legacy backup saved before maxContentChars existed can
// still be recovered by import rather than being rejected outright.
export const maxBackupBytes = 8000000;
export const contentLength = (value: Resume): number =>
 value.name.length + value.headline.length + value.email.length + value.phone.length + value.location.length + value.website.length + value.summary.length + value.skills.length + value.profileHeading.length + value.skillsHeading.length +
 value.sections.reduce((sum, section) => sum + section.title.length + section.entries.reduce((esum, item) => esum + item.title.length + item.organization.length + item.location.length + item.dates.length + item.description.length, 0), 0);
export function migrate(value: unknown): unknown {
 if (object(value)) {
  if (typeof value.profileHeading !== 'string') value.profileHeading = 'Profile';
  if (typeof value.skillsHeading !== 'string') value.skillsHeading = 'Skills & languages';
  if (typeof value.noExperience !== 'boolean') value.noExperience = false;
  if (Array.isArray(value.sections)) for (const section of value.sections) {
   if (object(section) && section.kind === undefined && typeof section.title === 'string' && /^(?:work experience|professional experience|experience|work history|employment history)$/i.test(section.title.trim())) section.kind = 'experience';
  }
 }
 return value;
}
export function isResume(value: unknown): value is Resume {
 if (!object(value) || value.version !== 1 || typeof value.noExperience !== 'boolean' || !strings(value,['name','headline','email','phone','location','website','summary','skills','accent','language']) || !strings(value,['profileHeading','skillsHeading'],200)) return false;
 if (!templateIds.includes(String(value.template) as TemplateId) || !['A4','Letter'].includes(String(value.paper)) || !['ltr','rtl'].includes(String(value.direction)) || !/^#[0-9a-f]{6}$/i.test(String(value.accent)) || !languagePattern.test(String(value.language))) return false;
 if (!Array.isArray(value.sections) || value.sections.length > 30) return false;
 const ids = new Set<string>();
 return value.sections.every(section => {
  if (!object(section) || !strings(section,['id','title']) || !Array.isArray(section.entries) || section.entries.length > 100 || ids.has(String(section.id))) return false;
  if (section.kind !== undefined && !['experience','optional'].includes(String(section.kind))) return false;
  ids.add(String(section.id));
  return section.entries.every(item => {if (!object(item) || !strings(item,['id','title','organization','location','dates','description']) || ids.has(String(item.id))) return false; ids.add(String(item.id)); return true;});
 });
}
export const storageKey = 'resumestride.resume.v1';
export const rescueKey = 'resumestride.resume.v1.rescue';

// Required-step completion checks. These are UX-level nudges toward a resume
// that is actually usable (a name, a way to reach the person, and no
// half-entered experience rows) — not a security boundary, and never a
// reason to invent facts the user hasn't provided. A section only needs a
// real title if the user is claiming work experience; education and custom
// sections stay fully optional so first-time applicants and non-linear
// backgrounds are never forced to fabricate content or blocked from
// finishing. `tab`/`field` identify where to send the user and which
// control to focus.
export type ValidationIssue = { tab: string; field: string; message: string };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Persist purpose independently of editable/localized headings; migrate known legacy headings.
export const isExperienceSection = (section: Section): boolean => section.kind === 'experience' || (section.kind === undefined && /^(?:work experience|professional experience|experience|work history|employment history)$/i.test(section.title.trim()));
export function validatePersonal(resume: Resume): ValidationIssue[] {
 const issues: ValidationIssue[] = [];
 if (!resume.name.trim()) issues.push({ tab: 'personal', field: 'name', message: 'Add your name.' });
 if (!resume.headline.trim()) issues.push({ tab: 'personal', field: 'headline', message: 'Add a professional title or the role you’re aiming for.' });
 const hasContact = [resume.email, resume.phone, resume.website].some(value => value.trim());
 if (!hasContact) issues.push({ tab: 'personal', field: 'email', message: 'Add at least one way to reach you: email, phone, or website.' });
 else if (resume.email.trim() && !emailPattern.test(resume.email.trim())) issues.push({ tab: 'personal', field: 'email', message: 'This email address doesn’t look valid.' });
 if (resume.phone.trim() && !/^[+\p{Nd}\s().\-/#xext]+$/iu.test(resume.phone.trim())) issues.push({ tab: 'personal', field: 'phone', message: 'Check the phone number; use digits, a country code and optional extension.' });
 if (resume.phone.trim() && (resume.phone.match(/\p{Nd}/gu) || []).length < 5) issues.push({ tab: 'personal', field: 'phone', message: 'Add a reachable phone number with at least five digits.' });
 if (resume.website.trim()) {
  try { const address = new URL(/^https?:\/\//i.test(resume.website.trim()) ? resume.website.trim() : `https://${resume.website.trim()}`); if (!['http:', 'https:'].includes(address.protocol) || !address.hostname.includes('.') || address.username || address.password || /\s/.test(resume.website)) throw new Error(); }
  catch { issues.push({ tab: 'personal', field: 'website', message: 'Add a valid public website or profile address, such as example.com/profile.' }); }
 }
 return issues;
}
export function validateSection(section: Section, noExperience: boolean): ValidationIssue[] {
 const issues: ValidationIssue[] = [];
 for (const item of section.entries) {
  const hasOther = [item.organization, item.location, item.dates, item.description].some(value => value.trim());
  if (!item.title.trim() && hasOther) issues.push({ tab: section.id, field: `entry-${item.id}-title`, message: 'Add a title for this entry, or clear its other details.' });
 }
 if (isExperienceSection(section) && !noExperience && !section.entries.some(item => item.title.trim())) {
  issues.push({ tab: section.id, field: 'no-experience', message: 'Add at least one role, or check “I don’t have work experience yet.”' });
 }
 return issues;
}
export function validateAll(resume: Resume): ValidationIssue[] {
 return [...validatePersonal(resume), ...resume.sections.flatMap(section => validateSection(section, resume.noExperience))];
}
