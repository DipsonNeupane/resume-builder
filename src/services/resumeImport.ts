import { entry, type Entry } from '../model';

export type ImportLine = { text: string; bold?: boolean; list?: boolean };

const rolePattern = /(?:\bfull[- ]?stack\s*developer\b|\b(?:developer|engineer|manager|analyst|architect|designer|consultant|specialist|coordinator|administrator|director|officer|associate|intern|technician|lead|teacher|professor|researcher|nurse|accountant|assistant|representative)\b)/i;
const organizationPattern = /\b(?:corporation|corp\.?|company|bank|university|college|school|institute|inc\.?|llc|ltd\.?|technologies|solutions|hospital|clinic|agency|ministry|department|foundation|group)\b/i;
const month = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const datePoint = `(?:${month}\\s+)?(?:19|20)\\d{2}`;
const dateRange = new RegExp(`\\b(${datePoint}\\s*(?:-|–|—|to)\\s*(?:${datePoint}|Present|Current|Till\\s+Date|Now))\\b`, 'i');

export const cleanHeading = (text: string): string => text.replace(/\s*[:;\-–—]+\s*$/, '').trim();

function looksLikeRole(text: string): boolean { return rolePattern.test(text); }
function looksLikeOrganization(text: string): boolean { return organizationPattern.test(text) || /,\s*[A-Z]{2,}\b/.test(text); }
function assignOrganization(item: Entry, text: string): void {
 const parts = text.split(',').map(part => part.trim()).filter(Boolean);
 if (parts.length > 1 && !/^(?:inc\.?|llc|ltd\.?|corp\.?)$/i.test(parts[1])) {
  item.organization = parts[0];
  item.location = parts.slice(1).join(', ');
 } else item.organization = text;
}
function appendDescription(item: Entry, text: string): void {
 const cleaned = text.replace(/^[•●▪◦\-]\s*/, '').trim();
 if (cleaned) item.description = item.description ? `${item.description}\n${cleaned}` : cleaned;
}

// Resume files use many visual conventions for work history. This parser keeps every
// line while recognizing the common company/date + role + responsibilities grammar.
// Ambiguous text stays in the entry description rather than being discarded or invented.
export function parseExperienceEntries(lines: ImportLine[]): Entry[] {
 const entries: Entry[] = [];
 let current: Entry = entry();
 const ensure = () => current;
 const hasContent = () => [current.title,current.organization,current.location,current.dates,current.description].some(value => value.trim());
 const finish = () => {
  if (hasContent()) entries.push(current);
  current = entry();
 };
 const classifyShortLine = (text: string, bold = false) => {
  const item = ensure();
  const paired = text.split(/\s+[—–]\s+/);
  if (paired.length === 2 && looksLikeRole(paired[0])) { item.title = paired[0].trim(); assignOrganization(item, paired[1].trim()); return; }
  if (!item.title && looksLikeRole(text)) { item.title = text; return; }
  if (!item.organization && (looksLikeOrganization(text) || (bold && item.title))) { assignOrganization(item, text); return; }
  appendDescription(item, text);
 };

 for (const line of lines) {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (!text || /^responsibilities\s*:?\s*-?$/i.test(text)) continue;
  const paired = text.split(/\s+[—–]\s+/);
  if (paired.length === 2 && looksLikeRole(paired[0])) {
   if (current.description || (current.title && (current.organization || current.dates))) finish();
   classifyShortLine(text, line.bold);
   continue;
  }
  const date = text.match(dateRange);
  if (date && date.index !== undefined) {
   const before = text.slice(0, date.index).replace(/[|,\s]+$/, '').trim();
   const after = text.slice(date.index + date[0].length).replace(/^[|,\s]+/, '').trim();
   if (current.description || (current.dates && (current.title || current.organization))) finish();
   const item = ensure();
   item.dates = date[1].trim();
   if (before) {
    if (looksLikeRole(before)) item.title = before;
    else if (!item.organization) assignOrganization(item, before);
    else if (!item.location) item.location = before;
    else appendDescription(item, before);
   }
   if (after) appendDescription(item, after);
   continue;
  }
  if (current.organization && current.dates && !current.title && looksLikeRole(text)) {
   current.title = text;
   continue;
  }
  if (!current.organization && current.title && !current.description && (looksLikeOrganization(text) || line.bold)) {
   assignOrganization(current, text);
   continue;
  }
  if (line.bold && text.length <= 180 && (looksLikeRole(text) || looksLikeOrganization(text))) {
   if (current.description) finish();
   classifyShortLine(text, true);
   continue;
  }
  appendDescription(ensure(), text);
 }
 finish();
 return entries;
}
