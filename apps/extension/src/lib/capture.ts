// Shared untrusted-data contract: extension, receiver, and authenticated server.
// No auth, matching, entitlement, or AI logic belongs here.
export type CaptureFields = {
  title: string; company: string; description: string;
  location?: string;
  workplace?: 'remote' | 'hybrid' | 'onsite' | 'field' | 'unknown';
  employmentType?: 'full_time' | 'part_time' | 'contract' | 'temporary' | 'internship' | 'unknown';
  salary?: { min: number; max: number; currency: string; period: 'hour' | 'year' } | null;
};
export type JobCapture = CaptureFields & {
  sourceUrl: string; capturedAt: string; originalSourceUrl?: string;
  site?: 'greenhouse' | 'lever' | 'jsonld' | 'fixture' | 'manual';
  original?: CaptureFields;
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v);
const fieldKeys = ['title', 'company', 'description', 'location', 'workplace', 'employmentType', 'salary'];
function fields(v: Record<string, unknown>): boolean {
  if (!text(v.title, 300) || !text(v.company, 300) || !text(v.description, 12000)) return false;
  if (v.location !== undefined && !text(v.location, 300)) return false;
  if (v.workplace !== undefined && !['remote','hybrid','onsite','field','unknown'].includes(String(v.workplace))) return false;
  if (v.employmentType !== undefined && !['full_time','part_time','contract','temporary','internship','unknown'].includes(String(v.employmentType))) return false;
  const s = v.salary;
  if (s !== undefined && s !== null && (!record(s) || Object.keys(s).some(k => !['min','max','currency','period'].includes(k)) || typeof s.min !== 'number' || typeof s.max !== 'number' || !Number.isFinite(s.min) || !Number.isFinite(s.max) || s.min < 0 || s.max < s.min || s.max > 1e12 || typeof s.currency !== 'string' || !/^[A-Z]{3}$/.test(s.currency) || !['hour','year'].includes(String(s.period)))) return false;
  return true;
}
export function captureSourceUrl(value: string): string | null {
  if (value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.origin + url.pathname;
  } catch { return null; }
}
export function isJobCapture(value: unknown): value is JobCapture {
  if (!record(value) || Object.keys(value).some(k => ![...fieldKeys,'sourceUrl','capturedAt','site','original','originalSourceUrl'].includes(k)) || !fields(value)) return false;
  if (!text(value.sourceUrl, 2000) || (value.sourceUrl && captureSourceUrl(value.sourceUrl) !== value.sourceUrl)) return false;
  if (value.originalSourceUrl !== undefined && (!text(value.originalSourceUrl, 2000) || (value.originalSourceUrl && captureSourceUrl(value.originalSourceUrl) !== value.originalSourceUrl))) return false;
  if (!text(value.capturedAt, 40) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value.capturedAt) || !Number.isFinite(Date.parse(value.capturedAt))) return false;
  if (new Date(value.capturedAt).toISOString().slice(0, 19) !== value.capturedAt.slice(0, 19)) return false;
  if (value.site !== undefined && !['greenhouse','lever','jsonld','fixture','manual'].includes(String(value.site))) return false;
  if (value.original !== undefined && (!record(value.original) || Object.keys(value.original).some(k => !fieldKeys.includes(k)) || !fields(value.original))) return false;
  return !!((value.title as string).trim() || (value.company as string).trim() || (value.description as string).trim());
}
