import { track, type BeforeSendEvent } from '@vercel/analytics';
import { isPublicAttributionLocation, isPublicLocation, productionOrigin } from '../seo/policy';

export const productEvents = [
 'landing_page_view', 'builder_started', 'resume_created', 'template_selected', 'resume_completed',
 'jobs_viewed', 'jobs_search_performed', 'job_saved', 'saved_jobs_viewed', 'match_opened', 'match_completed',
 'tailoring_started', 'suggestion_reviewed', 'suggestion_accepted', 'suggestion_rejected',
 'job_specific_resume_completed', 'export_started', 'export_completed', 'pricing_viewed',
 'upgrade_prompt_viewed', 'checkout_started', 'pro_activated',
 'content_page_view', 'content_cta_clicked',
 'tool_viewed', 'tool_started', 'tool_completed', 'tool_cta_clicked',
] as const;

export type ProductEvent = typeof productEvents[number];
type SafeValue = string | number | boolean | null | undefined;
export type ProductEventProperties = Partial<Record<
 'user_state' | 'plan' | 'surface' | 'export_type' | 'template' | 'outcome' | 'result_bucket' |
 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term' | 'referrer_host' |
 'article_slug' | 'tool_id' | 'cta_destination', SafeValue
>>;

const eventSet = new Set<string>(productEvents);
const propertyKeys = new Set<string>([
 'user_state', 'plan', 'surface', 'export_type', 'template', 'outcome', 'result_bucket',
 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer_host',
 'article_slug', 'tool_id', 'cta_destination',
]);
const enumValues: Record<string, ReadonlySet<string>> = {
 user_state: new Set(['anonymous', 'authenticated']),
 plan: new Set(['Free', 'Pro', 'Unknown']),
 surface: new Set(['home', 'builder', 'jobs', 'match', 'tailoring', 'pricing', 'account', 'export', 'resources']),
 export_type: new Set(['PDF', 'DOCX']),
 outcome: new Set(['success', 'failure', 'blocked']),
 result_bucket: new Set(['none', 'some']),
};
const safeToken = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/;
const safeHost = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})\.)+[A-Za-z]{2,63}$/;
const attributionStorageKey = 'resumestride.analytics.firstTouch';

export function sanitizeProductProperties(properties: ProductEventProperties = {}): Record<string, string | number | boolean | null> {
 const safe: Record<string, string | number | boolean | null> = {};
 for (const [key, value] of Object.entries(properties)) {
  if (!propertyKeys.has(key) || value === undefined) continue;
  if (typeof value === 'number') { if (Number.isFinite(value)) safe[key] = value; continue; }
  if (typeof value === 'boolean' || value === null) { safe[key] = value; continue; }
  if (typeof value !== 'string') continue;
  if (enumValues[key]) { if (enumValues[key].has(value)) safe[key] = value; continue; }
  if (key === 'referrer_host') { if (safeHost.test(value)) safe[key] = value.toLowerCase(); continue; }
  if (safeToken.test(value)) safe[key] = value;
 }
 return safe;
}

// Reconstruct the URL for every outbound record. Product event names and
// properties can enter the SDK only through trackProductEvent's closed schema.
export function safeAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
 try {
  const url = new URL(event.url);
  if (url.origin !== productionOrigin || url.username || url.password) return null;
  if (event.type === 'pageview') {
   if (!isPublicLocation(url) && !isPublicAttributionLocation(url)) return null;
   return { type: 'pageview', url: `${productionOrigin}${url.pathname}` };
  }
  if (event.type === 'event') return { type: 'event', url: `${productionOrigin}/` };
  return null;
 } catch { return null; }
}

export function safeSpeedInsight(event: { type: 'vital'; url: string; route?: string }): { type: 'vital'; url: string; route: string } | null {
 try {
  const url = new URL(event.url);
  if (url.origin !== productionOrigin || url.username || url.password) return null;
  return { type: 'vital', url: `${productionOrigin}/`, route: '/' };
 } catch { return null; }
}

export function trackProductEvent(name: ProductEvent, properties: ProductEventProperties = {}): void {
 try {
  if (typeof window === 'undefined' || window.location.origin !== productionOrigin || !eventSet.has(name)) return;
  track(name, sanitizeProductProperties(properties));
 } catch { /* Analytics is best-effort and must never affect product behavior. */ }
}

export function captureFirstTouchAttribution(url: URL, referrer: string, storage: Pick<Storage, 'getItem' | 'setItem'>): ProductEventProperties {
 try {
  const stored = storage.getItem(attributionStorageKey);
  if (stored) return sanitizeProductProperties(JSON.parse(stored) as ProductEventProperties);
 } catch { /* Fall through to an in-memory first touch for this load. */ }
 const properties: ProductEventProperties = {};
 for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
  const value = url.searchParams.get(key);
  if (value && safeToken.test(value)) properties[key] = value;
 }
 try {
  const host = new URL(referrer).hostname.toLowerCase();
  if (host !== url.hostname.toLowerCase() && safeHost.test(host)) properties.referrer_host = host;
 } catch { /* Direct or invalid referrer: record no referrer property. */ }
 const safe = sanitizeProductProperties(properties);
 try { storage.setItem(attributionStorageKey, JSON.stringify(safe)); } catch { /* Attribution storage is optional. */ }
 return safe;
}
