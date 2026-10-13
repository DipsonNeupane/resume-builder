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
  site?: 'linkedin' | 'indeed' | 'greenhouse' | 'lever' | 'workday' | 'jsonld' | 'fixture' | 'selection' | 'manual';
  original?: CaptureFields;
};
const indeedHosts = new Set(['indeed.com','www.indeed.com','ca.indeed.com','uk.indeed.com','au.indeed.com','in.indeed.com','de.indeed.com','fr.indeed.com','nl.indeed.com','jp.indeed.com','sg.indeed.com','ie.indeed.com','ae.indeed.com','indeed.co.uk','www.indeed.co.uk','indeed.ca','www.indeed.ca','indeed.com.au','www.indeed.com.au','indeed.co.in','www.indeed.co.in','indeed.de','www.indeed.de','indeed.fr','www.indeed.fr','indeed.nl','www.indeed.nl','indeed.co.jp','www.indeed.co.jp','indeed.com.sg','www.indeed.com.sg','indeed.ie','www.indeed.ie','indeed.ae','www.indeed.ae']);
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
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) return null;
    const hostname = url.hostname.toLowerCase();
    const linkedin = /^(?:www\.)?linkedin\.com$/.test(hostname);
    if (linkedin) {
      const pathId = url.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?([0-9]{3,20})\/?$/)?.[1];
      const queryId = url.pathname.startsWith('/jobs/search') ? url.searchParams.get('currentJobId') : null;
      const id = pathId || (queryId && /^[0-9]{3,20}$/.test(queryId) ? queryId : null);
      return id ? `https://www.linkedin.com/jobs/view/${id}/` : null;
    }
    const indeed = indeedHosts.has(hostname);
    if (indeed) {
      const id = url.searchParams.get('jk') || url.searchParams.get('vjk');
      if (!id || !/^[A-Za-z0-9_-]{6,80}$/.test(id)) return null;
      return `${url.origin}/viewjob?jk=${encodeURIComponent(id)}`;
    }
    const meaningful = Array.from(url.searchParams.keys()).filter(key => !/^(utm_[a-z_]+|gclid|fbclid)$/i.test(key));
    if (meaningful.length) return null;
    return url.origin + (url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, ''));
  } catch { return null; }
}
export function isJobCapture(value: unknown): value is JobCapture {
  if (!record(value) || Object.keys(value).some(k => ![...fieldKeys,'sourceUrl','capturedAt','site','original','originalSourceUrl'].includes(k)) || !fields(value)) return false;
  if (!text(value.sourceUrl, 2000) || (value.sourceUrl && captureSourceUrl(value.sourceUrl) !== value.sourceUrl)) return false;
  if (value.originalSourceUrl !== undefined && (!text(value.originalSourceUrl, 2000) || (value.originalSourceUrl && captureSourceUrl(value.originalSourceUrl) !== value.originalSourceUrl))) return false;
  if (!text(value.capturedAt, 40) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value.capturedAt) || !Number.isFinite(Date.parse(value.capturedAt))) return false;
  if (new Date(value.capturedAt).toISOString().slice(0, 19) !== value.capturedAt.slice(0, 19)) return false;
  if (value.site !== undefined && !['linkedin','indeed','greenhouse','lever','workday','jsonld','fixture','selection','manual'].includes(String(value.site))) return false;
  if (value.original !== undefined && (!record(value.original) || Object.keys(value.original).some(k => !fieldKeys.includes(k)) || !fields(value.original))) return false;
  return !!((value.title as string).trim() || (value.company as string).trim() || (value.description as string).trim());
}
