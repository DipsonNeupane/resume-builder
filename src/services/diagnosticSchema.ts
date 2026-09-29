// Shared closed vocabulary. Never add free text, URLs, identifiers for accounts or
// documents, error messages/stacks, headers, request/response bodies or fingerprints.
export const features = ['auth', 'cloud', 'billing', 'entitlement', 'ai', 'ai_accounting', 'jobs', 'match', 'export', 'extension', 'database', 'server'] as const;
export const categories = ['ok', 'invalid_request', 'authentication', 'authorization', 'not_found', 'conflict', 'rate_limit', 'unavailable', 'configuration', 'unexpected', 'database_error', 'database_conflict', 'provider_failure', 'provider_rate_limit', 'provider_timeout', 'provider_invalid', 'ai_budget', 'ai_limit', 'ai_accounting', 'ai_uncertain', 'export_failure', 'bridge_rejected'] as const;
export const operations = ['request', 'auth_verify', 'auth_session', 'database', 'cloud_load', 'cloud_create', 'cloud_save', 'provider_search', 'provider_tailor', 'billing_provider', 'ai_reserve', 'ai_start', 'ai_finish', 'match_analyze', 'export_render', 'bridge_receive', 'cache_hit', 'cache_miss', 'cache_join'] as const;
export const routes = ['billing-status', 'cancel-offer', 'cancel-subscription', 'checkout', 'customer-portal', 'dispatch-billing-notices', 'export-docx', 'export-pdf', 'export-status', 'jobs-account', 'jobs-search', 'stripe-webhook', 'subscribe', 'subscription-checkout', 'subscription-status', 'tailor'] as const;
export type Feature = typeof features[number];
export type Category = typeof categories[number];
export type Operation = typeof operations[number];
export type Route = typeof routes[number];
export const boundedDuration = (value: number) => Number.isFinite(value) ? Math.min(3_600_000, Math.max(0, Math.round(value))) : 0;
export function statusCategory(status: number): Category {
 if (status < 400) return 'ok';
 if (status === 401) return 'authentication';
 if (status === 402 || status === 403) return 'authorization';
 if (status === 404) return 'not_found';
 if (status === 409) return 'conflict';
 if (status === 429) return 'rate_limit';
 return status < 500 ? 'invalid_request' : 'unavailable';
}
