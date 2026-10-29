/** Bounded CSV import/export for the application tracker. Parsing happens in the
 * browser; the server re-validates every row (src/lib/applications.ts). Export escapes
 * spreadsheet formula injection: a cell that begins with = + - @, tab or carriage
 * return is prefixed with an apostrophe so spreadsheet apps show it as text. */
import { CLOSED_REASON_LABELS, STAGE_LABELS, isClosedReason, type ApplicationRecord, type ClosedReason, type Stage } from './applications';

export const CSV_LIMITS = { bytes: 1_000_000, rows: 200, columns: 40, cell: 12_000 } as const;

export class CsvError extends Error { constructor(message: string) { super(message); this.name = 'CsvError'; } }

/** RFC 4180 parser (quoted fields, doubled quotes, CRLF/LF, optional BOM). */
export function parseCsv(input: string): string[][] {
  if (input.length > CSV_LIMITS.bytes) throw new CsvError('This file is larger than 1 MB. Split it into smaller files.');
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"' && cell === '') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
    if (cell.length > CSV_LIMITS.cell) throw new CsvError(`A cell on row ${rows.length + 1} is too long.`);
  }
  if (quoted) throw new CsvError('The file has an unclosed quotation mark.');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  if (rows.length && rows[0].length > CSV_LIMITS.columns) throw new CsvError(`Use at most ${CSV_LIMITS.columns} columns.`);
  if (rows.length - 1 > CSV_LIMITS.rows) throw new CsvError(`Import at most ${CSV_LIMITS.rows} applications at a time.`);
  return rows;
}

export const IMPORT_FIELDS = ['company', 'title', 'stage', 'appliedOn', 'sourceUrl', 'location', 'nextAction', 'nextActionDue', 'notes', 'contactName', 'closedReason'] as const;
export type ImportField = typeof IMPORT_FIELDS[number];
export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  company: 'Company (required)', title: 'Role (required)', stage: 'Stage', appliedOn: 'Applied date', sourceUrl: 'Job link',
  location: 'Location', nextAction: 'Next action', nextActionDue: 'Next action due', notes: 'Notes', contactName: 'Contact name', closedReason: 'Closed reason',
};
export type ColumnMapping = Partial<Record<ImportField, number>>;

const HEADER_GUESSES: Record<ImportField, RegExp> = {
  company: /^(?:company|employer|organi[sz]ation)(?: name)?$/i,
  title: /^(?:role|title|job(?: title)?|position)$/i,
  stage: /^(?:stage|status)$/i,
  appliedOn: /^(?:applied(?: on| date)?|date applied|application date)$/i,
  sourceUrl: /^(?:url|link|job (?:url|link)|posting)$/i,
  location: /^(?:location|city)$/i,
  nextAction: /^(?:next (?:action|step)|to ?do)$/i,
  nextActionDue: /^(?:next (?:action|step) (?:due|date)|due(?: date)?|follow[- ]?up(?: date)?)$/i,
  notes: /^(?:notes?|comments?)$/i,
  contactName: /^(?:contact|recruiter|contact name)$/i,
  closedReason: /^(?:closed reason|reason|outcome)$/i,
};

export function guessMapping(header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  header.forEach((name, index) => {
    const value = name.trim();
    for (const field of IMPORT_FIELDS) if (mapping[field] === undefined && HEADER_GUESSES[field].test(value)) { mapping[field] = index; break; }
  });
  return mapping;
}

const STAGE_WORDS: Record<string, Stage> = {
  saved: 'saved', interested: 'saved', wishlist: 'saved', bookmarked: 'saved', 'not applied': 'saved',
  preparing: 'preparing', 'in progress': 'preparing', drafting: 'preparing',
  applied: 'applied', submitted: 'applied',
  interviewing: 'interviewing', interview: 'interviewing', interviews: 'interviewing', screening: 'interviewing',
  offer: 'offer', offered: 'offer',
  closed: 'closed', rejected: 'closed', declined: 'closed', withdrawn: 'closed', archived: 'closed', 'no response': 'closed', ghosted: 'closed',
};
const REASON_WORDS: Record<string, ClosedReason> = {
  rejected: 'rejected', declined: 'rejected', withdrawn: 'withdrawn', withdrew: 'withdrawn', 'role closed': 'role_closed', 'position closed': 'role_closed',
  'no response': 'no_response', ghosted: 'no_response', archived: 'archived', other: 'other',
};

function normalizedDay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? trimmed : new Date(parsed - new Date(parsed).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Maps CSV rows into application input objects. Unknown stage words stay as typed so
 * the server reports them as row errors instead of guessing. "Rejected"/"No response"
 * keep their distinct closed reasons; neither is inferred from the other. */
export function mapRows(rows: string[][], mapping: ColumnMapping, hasHeader = true): Record<string, unknown>[] {
  return rows.slice(hasHeader ? 1 : 0).map(cells => {
    const get = (field: ImportField) => (mapping[field] === undefined ? '' : (cells[mapping[field]!] ?? '')).trim();
    const stageWord = get('stage').toLocaleLowerCase();
    const stage = stageWord ? (STAGE_WORDS[stageWord] ?? stageWord) : 'saved';
    const reasonWord = (get('closedReason') || (stage === 'closed' ? stageWord : '')).toLocaleLowerCase();
    const closedReason = REASON_WORDS[reasonWord] ?? (isClosedReason(reasonWord) ? reasonWord : stage === 'closed' ? 'other' : undefined);
    const due = get('nextActionDue');
    return {
      company: get('company'), title: get('title'), stage, closedReason,
      appliedOn: normalizedDay(get('appliedOn')), sourceUrl: get('sourceUrl'), location: get('location'),
      nextAction: get('nextAction') || (due ? 'Follow up' : ''),
      nextActionDue: due ? (Number.isNaN(Date.parse(due)) ? due : new Date(Date.parse(due)).toISOString()) : '',
      notes: get('notes'), contactName: get('contactName'),
    };
  });
}

export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export type ExportRow = { company: string; title: string; sourceUrl: string | null; location: string; application: ApplicationRecord };

/** Plain user data only: no internal identifiers, analytics or match details. */
export function applicationsToCsv(rows: ExportRow[]): string {
  const header = ['Company', 'Role', 'Stage', 'Closed reason', 'Applied date', 'Next action', 'Next action due', 'Job link', 'Location', 'Contact name', 'Contact details', 'Notes', 'Added', 'Last updated'];
  const lines = rows.map(({ company, title, sourceUrl, location, application: item }) => [
    company, title, STAGE_LABELS[item.stage], item.closedReason ? CLOSED_REASON_LABELS[item.closedReason] : '', item.appliedOn ?? '',
    item.nextAction, item.nextActionDue ?? '', sourceUrl ?? '', location, item.contactName, item.contactDetails, item.notes,
    item.createdAt.slice(0, 10), item.updatedAt.slice(0, 10),
  ].map(value => csvCell(String(value))).join(','));
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}
