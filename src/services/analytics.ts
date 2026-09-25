import type { BeforeSendEvent } from '@vercel/analytics';
import { isPublicLocation, productionOrigin } from '../seo/policy';

// Deny custom events and unknown/private/query/token locations. Construct a new
// record: no future SDK extras or arbitrary event properties survive this gate.
export function safeAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
 try {
  const url = new URL(event.url);
  if (event.type !== 'pageview' || url.origin !== productionOrigin || url.username || url.password || !isPublicLocation(url)) return null;
  return { type: 'pageview', url: `${productionOrigin}${url.pathname}` };
 } catch { return null; }
}
