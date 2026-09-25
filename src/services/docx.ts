// Best-effort Microsoft Word (.docx / OOXML) import. DOCX generation lives
// only in server/export/docx.ts so browser code cannot bypass the authenticated
// shared document-download allowance.
import { blank, entry, type Entry, type Resume, type Section } from '../model';
import { readZip } from './zip';
import { cleanHeading, parseExperienceEntries, type ImportLine } from './resumeImport';

const NAME_SIZE = 32; // 16pt
const HEADING_SIZE = 24; // 12pt, bold section headings
const TITLE_SIZE = 22; // 11pt, bold entry titles / italic headline
const BODY_SIZE = 20; // 10pt, contact line / meta line / body text

interface ParsedParagraph extends ImportLine { bold: boolean; italic: boolean; size: number; list: boolean; tableRow: number | null; tableCell: number | null }

function unescapeXml(value: string): string {
 return value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
  .replace(/&amp;/g, '&');
}

function parseParagraphs(xml: string): ParsedParagraph[] {
 const paragraphs: ParsedParagraph[] = [];
 const tableRows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((row, tableRow) => ({
  start: row.index ?? -1,
  end: (row.index ?? -1) + row[0].length,
  tableRow,
  cells: [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cell, tableCell) => ({ start: (row.index ?? 0) + (cell.index ?? 0), end: (row.index ?? 0) + (cell.index ?? 0) + cell[0].length, tableCell })),
 }));
 const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
 let pMatch: RegExpExecArray | null;
 while ((pMatch = pRegex.exec(xml))) {
  const block = pMatch[0];
  // Match the exact OOXML text element. `<w:t[^>]*>` also matches `<w:tabs>`
  // and `<w:tab>`, which can leak paragraph-property XML into imported text.
  // Preserve tabs as a strong separator and split explicit line breaks into
  // separate logical lines so a name and email do not become one field.
  const lines = [''];
  const tokenRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br)(?:\s[^>]*)?\s*\/>/g;
  let token: RegExpExecArray | null;
  while ((token = tokenRegex.exec(block))) {
   if (token[1] !== undefined) lines[lines.length - 1] += unescapeXml(token[1]);
   else if (token[2] === 'br') lines.push('');
   else if (lines[lines.length - 1] && !/\s$/.test(lines[lines.length - 1])) lines[lines.length - 1] += '  ';
  }
  const bold = /<w:b\s*\/>|<w:b\s+w:val="(?:1|true)"/.test(block);
  const italic = /<w:i\s*\/>|<w:i\s+w:val="(?:1|true)"/.test(block);
  const sizeMatches = [...block.matchAll(/<w:sz\s+w:val="(\d+)"/g)].map(match => Number(match[1]));
  const size = sizeMatches.length ? Math.max(...sizeMatches) : BODY_SIZE;
  const row = tableRows.find(item => (pMatch?.index ?? -1) > item.start && (pMatch?.index ?? -1) < item.end);
  const cell = row?.cells.find(item => (pMatch?.index ?? -1) > item.start && (pMatch?.index ?? -1) < item.end);
  for (const text of lines) {
   const fragments = text.split(/\s+[•●▪◦]\s+/).filter(Boolean);
   for (const fragment of fragments) {
    const trimmed = fragment.replace(/[ \t]+/g, match => match.length > 1 ? '  ' : ' ').trim();
    if (trimmed) paragraphs.push({ text: trimmed, bold, italic, size, list: /<w:numPr\b/.test(block), tableRow: row?.tableRow ?? null, tableCell: cell?.tableCell ?? null });
   }
  }
 }
 const consolidated: ParsedParagraph[] = [];
 for (let index = 0; index < paragraphs.length;) {
  const first = paragraphs[index];
  if (first.tableRow === null) { consolidated.push(first); index++; continue; }
  const row = paragraphs.filter(item => item.tableRow === first.tableRow);
  const cells = [...new Set(row.map(item => item.tableCell))].map(cellIndex => row.filter(item => item.tableCell === cellIndex).map(item => item.text).join(' ').trim()).filter(Boolean);
  consolidated.push({ ...first, text: cells.length > 1 ? `${cells[0]}: ${cells.slice(1).join(' ')}` : cells[0] });
  index += row.length;
 }
 return consolidated;
}

const emailPattern = /[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}/;
const urlPattern = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;
const phonePattern = /^[+()\d][\d\s().\-/]{4,}$/;

const sectionKeywords: { pattern: RegExp; kind: 'experience' | 'education' | 'summary' | 'skills' }[] = [
 { pattern: /^(work experience|professional experience|experience|work history|employment history)$/i, kind: 'experience' },
 { pattern: /^education$/i, kind: 'education' },
 { pattern: /^(profile|professional profile|summary|professional summary|about|about me|objective)$/i, kind: 'summary' },
 { pattern: /^(skills|technical skills|core skills|key skills|skills\s*(&|and)\s*languages|languages)$/i, kind: 'skills' },
];

const headingText = cleanHeading;
const sectionKeyword = (text: string) => sectionKeywords.find(item => item.pattern.test(headingText(text)));

// Split only on the bullet/2+-space separators this file's own export uses to join contact
// fields — deliberately NOT on a bare comma, since "City, Country" is a single location value
// that would otherwise be shredded into two unrelated tokens.
function splitContactTokens(text: string): string[] {
 return text.split(/[•·]|\s{2,}/).map(part => part.trim()).filter(Boolean);
}

export interface DocxImportResult { resume: Partial<Resume>; sections: Section[] }

// Best-effort structural extraction, not a general-purpose Word parser: it recognizes the
// grammar this file's own export produces (name, then headline, then a contact line, then
// bold section headings with bold entry titles beneath them) and applies the same reading to
// other simply-formatted resumes. Content that doesn't fit the pattern is kept as plain
// description text under the nearest section rather than dropped.
export function docxToResume(xml: string): DocxImportResult {
 const paragraphs = parseParagraphs(xml);
 const result: Partial<Resume> = {};
 const sections: Section[] = [];
 let i = 0;
 const contactParts = { email: '', phone: '', location: '', website: '' };
 if (i < paragraphs.length) {
  const first = paragraphs[i].text;
  const email = first.match(emailPattern)?.[0] ?? '';
  if (email) contactParts.email = email;
  result.name = first.replace(email, '').replace(/[•·|]+\s*$/, '').trim();
  i++;
 }
 if (i < paragraphs.length) {
  const candidate = paragraphs[i];
  const looksLikeContact = emailPattern.test(candidate.text) || phonePattern.test(candidate.text) || Boolean(sectionKeyword(candidate.text));
  if (!looksLikeContact && !(candidate.bold && candidate.size >= HEADING_SIZE)) { result.headline = candidate.text; i++; }
 }
 while (i < paragraphs.length) {
  const line = paragraphs[i];
  if (line.bold && line.size >= HEADING_SIZE) break;
  if (sectionKeyword(line.text)) break;
  const tokens = splitContactTokens(line.text);
  let matchedAny = false;
  let unmatched = '';
  for (const token of tokens) {
   const email = token.match(emailPattern)?.[0];
   if (email) { contactParts.email = email; matchedAny = true; }
   else if (phonePattern.test(token) && (token.match(/\d/g) || []).length >= 5) { contactParts.phone = token; matchedAny = true; }
   else if (urlPattern.test(token)) { contactParts.website = token; matchedAny = true; }
   else if (!unmatched) unmatched = token;
  }
  const plausibleLocation = !contactParts.location && Boolean(unmatched) && unmatched.length <= 120 && !/:/.test(unmatched);
  if (!matchedAny && !plausibleLocation) break;
  if (plausibleLocation) contactParts.location = unmatched;
  i++;
 }
 Object.assign(result, contactParts);
 let mode: 'none' | 'summary' | 'skills' | 'section' = 'none';
 let summaryLines: string[] = [];
 let skillsLines: string[] = [];
 let currentSection: Section | null = null;
 let currentEntry: Entry | null = null;
 let experienceLines: ParsedParagraph[] = [];
 const finishEntry = () => { if (currentEntry && currentSection) currentSection.entries.push(currentEntry); currentEntry = null; };
 const finishSection = () => { if(currentSection?.kind==='experience'&&experienceLines.length)currentSection.entries.push(...parseExperienceEntries(experienceLines));experienceLines=[];finishEntry(); if (currentSection && currentSection.entries.length) sections.push(currentSection); currentSection = null; };
 for (; i < paragraphs.length; i++) {
  const line = paragraphs[i];
  const keyword = sectionKeyword(line.text);
  const visualHeading = line.bold && line.size >= HEADING_SIZE && currentSection?.kind !== 'experience';
  if (keyword || visualHeading) {
   finishSection();
   const title = headingText(line.text);
   if (keyword?.kind === 'summary') { mode = 'summary'; result.profileHeading = title; continue; }
   if (keyword?.kind === 'skills') { mode = 'skills'; result.skillsHeading = title; continue; }
   mode = 'section';
   currentSection = { id: crypto.randomUUID(), title, entries: [], ...(keyword?.kind === 'experience' ? { kind: 'experience' as const } : {}) };
   continue;
  }
  if (mode === 'summary') { summaryLines.push(line.list ? `• ${line.text}` : line.text); continue; }
  if (mode === 'skills') { skillsLines.push(line.text); continue; }
  if (mode === 'section' && currentSection) {
   if (currentSection.kind === 'experience') { experienceLines.push(line); continue; }
   if (line.bold && line.size === TITLE_SIZE) {
    finishEntry();
    const [title, organization] = line.text.split(/\s*—\s*/);
    currentEntry = { ...entry(), title: title ?? line.text, organization: organization ?? '' };
    continue;
   }
   if (!currentEntry) currentEntry = entry();
   if (line.italic && !line.bold && !currentEntry.location && !currentEntry.dates) {
    const [location, dates] = line.text.split(/\s*\|\s*/);
    currentEntry.location = location ?? '';
    currentEntry.dates = dates ?? '';
    continue;
   }
   const cleaned = line.text.replace(/^•\s*/, '');
   currentEntry.description = currentEntry.description ? `${currentEntry.description}\n${cleaned}` : cleaned;
  }
 }
 finishSection();
 if (summaryLines.length) result.summary = summaryLines.join('\n');
 if (skillsLines.length) result.skills = skillsLines.join('\n');
 return { resume: result, sections };
}

export const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const clampField = (value: string | undefined, max = 50000): string => (value ?? '').slice(0, max);

// Turns the heuristic extraction above into a full, schema-valid Resume: clamps every field to
// the same per-field caps the editor itself enforces (so an oversized or adversarial Word
// document can't produce a draft the app would then refuse to re-export), drops empty sections,
// and refuses a document with no recognizable content at all rather than importing a blank draft.
export function resumeFromDocxImport(xml: string): Resume {
 const { resume: parsed, sections } = docxToResume(xml);
 const base = blank();
 const name = clampField(parsed.name);
 const headline = clampField(parsed.headline);
 const usableSections = sections.filter(section => section.entries.length > 0).slice(0, 30).map(section => ({
  ...section,
  title: clampField(section.title) || 'Untitled section',
  entries: section.entries.slice(0, 100).map(item => ({
   ...item,
   title: clampField(item.title),
   organization: clampField(item.organization),
   location: clampField(item.location),
   dates: clampField(item.dates),
   description: clampField(item.description),
  })),
 }));
 if (!name && !headline && !parsed.summary && usableSections.length === 0) throw new Error('No resume content could be found in this Word document.');
 return {
  ...base,
  name,
  headline,
  email: clampField(parsed.email),
  phone: clampField(parsed.phone),
  location: clampField(parsed.location),
  website: clampField(parsed.website),
  summary: clampField(parsed.summary),
  skills: clampField(parsed.skills),
  profileHeading: clampField(parsed.profileHeading, 200) || base.profileHeading,
  skillsHeading: clampField(parsed.skillsHeading, 200) || base.skillsHeading,
  sections: usableSections.length ? usableSections : base.sections,
 };
}

export async function resumeFromDocxFile(buffer: ArrayBuffer): Promise<Resume> {
 const files = await readZip(buffer);
 const documentXml = files.get('word/document.xml');
 if (!documentXml) throw new Error('This file is not a valid Word document (.docx).');
 const xml = new TextDecoder().decode(documentXml);
 return resumeFromDocxImport(xml);
}
