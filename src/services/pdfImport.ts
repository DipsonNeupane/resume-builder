/// <reference types="vite/client" />
import { blank, entry, type Resume, type Section } from '../model';
import { cleanHeading, parseExperienceEntries } from './resumeImport';

export type PdfTextLine = { text: string; fontSize?: number; page?: number };

const emailPattern = /[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}/;
const phonePattern = /^[+()\d][\d\s().\-/]{4,}$/;
const urlPattern = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;
const sectionKinds: { pattern: RegExp; kind: 'summary' | 'skills' | 'experience' | 'section' }[] = [
 { pattern: /^(profile|professional profile|summary|professional summary|about|about me|objective)$/i, kind: 'summary' },
 { pattern: /^(skills|technical skills|core skills|key skills|skills\s*(&|and)\s*languages|languages)$/i, kind: 'skills' },
 { pattern: /^(work experience|professional experience|experience|work history|employment history)$/i, kind: 'experience' },
 { pattern: /^(education|projects?|volunteering|volunteer experience|certifications?|research|publications?|awards?)$/i, kind: 'section' },
];

const clamp = (value: string | undefined, max = 50000): string => (value ?? '').trim().slice(0, max);
const contactParts = (text: string): Partial<Pick<Resume, 'email' | 'phone' | 'location' | 'website'>> => {
 const result: Partial<Pick<Resume, 'email' | 'phone' | 'location' | 'website'>> = {};
 const tokens = text.split(/[•·]|\s{2,}/).map(value => value.trim()).filter(Boolean);
 let foundContact = false;
 for (const token of tokens) {
  if (emailPattern.test(token)) { result.email = token.match(emailPattern)?.[0] ?? token; foundContact = true; }
  else if (phonePattern.test(token) && (token.match(/\d/g) ?? []).length >= 5) { result.phone = token; foundContact = true; }
  else if (urlPattern.test(token)) { result.website = token; foundContact = true; }
 }
 if (foundContact) {
  const remaining = tokens.filter(token => !emailPattern.test(token) && !(phonePattern.test(token) && (token.match(/\d/g) ?? []).length >= 5) && !urlPattern.test(token));
  if (remaining.length === 1) result.location = remaining[0];
 }
 return result;
};

function sectionKind(line: PdfTextLine, bodySize: number) {
 const normalized = cleanHeading(line.text);
 const known = sectionKinds.find(item => item.pattern.test(normalized));
 if (known) return known.kind;
 const letters = line.text.replace(/[^\p{L}]/gu, '');
 const upper = letters.length >= 3 && letters === letters.toLocaleUpperCase() && line.text.length <= 80;
 const visuallyProminent = Boolean(line.fontSize && bodySize && line.fontSize >= bodySize * 1.18 && line.text.length <= 80);
 return upper || visuallyProminent ? 'section' as const : null;
}

// PDF is a page-description format, not a resume data format. This mapper therefore only
// assigns fields supported by explicit text patterns and keeps ambiguous section content as
// description text. It never manufactures dates, employers, qualifications, or other facts.
export function resumeFromPdfText(linesInput: PdfTextLine[]): Resume {
 const lines = linesInput.map(line => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() })).filter(line => line.text);
 if (!lines.length) throw new Error('No selectable text was found in this PDF. It may be scanned or image-only. Try a text-based PDF or a Word (.docx) file.');

 const sizes = lines.map(line => line.fontSize ?? 0).filter(Boolean).sort((a, b) => a - b);
 const bodySize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
 // A prominent name/headline at the top is not a section heading. Only begin looking for a
 // section after those two common header slots; exact contact lines are still handled below.
 const firstSection = lines.findIndex((line, index) => index >= 2 && sectionKind(line, bodySize));
 const header = lines.slice(0, firstSection < 0 ? lines.length : firstSection);
 const result = blank();
 let headerIndex = 0;
 while (headerIndex < header.length && Object.keys(contactParts(header[headerIndex].text)).length) {
  Object.assign(result, contactParts(header[headerIndex].text));
  headerIndex++;
 }
 if (headerIndex < header.length) result.name = clamp(header[headerIndex++].text);
 const unusedHeader: string[] = [];
 for (; headerIndex < header.length; headerIndex++) {
  const parts = contactParts(header[headerIndex].text);
  if (Object.keys(parts).length) Object.assign(result, Object.fromEntries(Object.entries(parts).filter(([, value]) => value)));
  else if (!result.headline) result.headline = clamp(header[headerIndex].text);
  else unusedHeader.push(header[headerIndex].text);
 }

 const sections: Section[] = [];
 let summary: string[] = unusedHeader;
 let skills: string[] = [];
 let current: { title: string; kind: 'summary' | 'skills' | 'experience' | 'section'; lines: string[] } | null = null;
 let activeKind: 'summary' | 'skills' | 'experience' | 'section' | null = null;
 const finish = () => {
  if (!current) return;
  if (current.kind === 'summary') summary.push(...current.lines);
  else if (current.kind === 'skills') skills.push(...current.lines);
  else if (current.kind === 'experience') {
   const entries = parseExperienceEntries(current.lines.map(text => ({ text })));
   if (entries.length) sections.push({ id: crypto.randomUUID(), title: cleanHeading(current.title), kind: 'experience', entries });
  }
  else if (current.lines.length) {
   const item = entry();
   const explicitTitle = current.lines[0].match(/^(.{1,120}?)\s+[—–]\s+(.{1,120})$/);
   if (explicitTitle) {
    item.title = clamp(explicitTitle[1]);
    item.organization = clamp(explicitTitle[2]);
    item.description = clamp(current.lines.slice(1).join('\n'));
   } else item.description = clamp(current.lines.join('\n'));
   sections.push({ id: crypto.randomUUID(), title: clamp(current.title, 200) || 'Untitled section', entries: [item] });
  }
  current = null;
  activeKind = null;
 };

 const content = firstSection < 0 ? [] : lines.slice(firstSection);
 for (const line of content) {
  const knownKind = sectionKinds.find(item=>item.pattern.test(cleanHeading(line.text)))?.kind ?? null;
  const kind: 'summary' | 'skills' | 'experience' | 'section' | null = knownKind ?? (activeKind==='experience'?null:sectionKind(line, bodySize));
  if (kind) { finish(); current = { title: line.text, kind, lines: [] }; activeKind = kind; }
  else if (current) current.lines.push(line.text.replace(/^[•●▪◦]\s*/, ''));
  else summary.push(line.text);
 }
 finish();
 result.summary = clamp(summary.join('\n'));
 result.skills = clamp(skills.join('\n'));
 if (sections.length) result.sections = sections.slice(0, 30);
 if (!result.name && !result.headline && !result.summary && !result.skills && !sections.length) throw new Error('No usable resume text could be found in this PDF.');
 return result;
}

type PdfTextItem = { str: string; transform: number[]; hasEOL?: boolean };

export function pdfImportError(error: unknown): Error {
 const name = error instanceof Error ? error.name : '';
 const message = error instanceof Error ? error.message : '';
 if (name === 'PasswordException' || /password|encrypted/i.test(message)) return new Error('This PDF is encrypted or password-protected. Remove the protection, then upload it again.');
 return new Error('This PDF could not be read. It may be damaged or not be a valid PDF. Try exporting it again or upload a Word (.docx) file.');
}

export async function resumeFromPdfFile(buffer: ArrayBuffer): Promise<Resume> {
 let document: { numPages: number; getPage(page: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>; destroy(): Promise<void> } | null = null;
 try {
  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
   import('pdfjs-dist'),
   import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, enableXfa: false });
  document = await task.promise;
  const lines: PdfTextLine[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
   const page = await document.getPage(pageNumber);
   const content = await page.getTextContent();
   const items = content.items.filter((item): item is PdfTextItem => typeof item === 'object' && item !== null && 'str' in item && 'transform' in item);
   const positioned = items.map(item => ({ text: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, fontSize: Math.hypot(item.transform[0] ?? 0, item.transform[1] ?? 0) }));
   positioned.sort((a, b) => Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x);
   let row: typeof positioned = [];
   const pushRow = () => {
    const text = row.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim();
    if (text) lines.push({ text, fontSize: Math.max(...row.map(item => item.fontSize)), page: pageNumber });
    row = [];
   };
   for (const item of positioned) {
    if (row.length && Math.abs(row[0].y - item.y) > 2) pushRow();
    row.push(item);
   }
   if (row.length) pushRow();
  }
  return resumeFromPdfText(lines);
 } catch (error) {
  if (error instanceof Error && /No selectable text|No usable resume text/.test(error.message)) throw error;
  throw pdfImportError(error);
 } finally {
  await document?.destroy().catch(() => undefined);
 }
}
