// Local extension configuration. Keep field caps consistent with web receiver.
export const jobImportMessageType = 'resumestride:job-import' as const;
export const maxShortFieldChars = 300;
export const maxDescriptionChars = 12000;

// The exact production origin this extension is allowed to deliver into. Kept as a single
// hardcoded constant (not overridable by any field the popup can widen) so the destination
// allowlist below can never be tricked into treating a look-alike host as production.
export const productionAppOrigin = 'https://resumestride.com';
export const productionAppUrl = `${productionAppOrigin}/`;
// Production is the default destination. A developer can still point the popup's app-URL field
// at a local dev server for testing (see apps/extension/README.md's demo steps) — localhost stays
// allowed below for exactly that, never as the default.
export const defaultAppUrl = productionAppUrl;

const devPorts = ['5173', '5183', '5185'];

function isExactRootUrl(url: URL): boolean {
 return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
}

export function isAllowedAppUrl(url: URL): boolean {
 if (url.protocol === 'https:' && url.origin === productionAppOrigin) return isExactRootUrl(url);
 if (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname) && devPorts.includes(url.port)) return isExactRootUrl(url);
 return false;
}
