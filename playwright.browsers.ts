import type { Project } from '@playwright/test';

// Keep ordinary local runs Chromium-only. The explicit compatibility run uses
// every requested engine and fails if one cannot launch; no silent skipping.
export function browserProjects(): Project[] {
 const names = (process.env.PLAYWRIGHT_BROWSERS ?? 'chromium').split(',').map(name => name.trim());
 return [...new Set(names)].map(name => {
  if (name !== 'chromium' && name !== 'firefox' && name !== 'webkit') {
   throw new Error(`Unsupported PLAYWRIGHT_BROWSERS entry: ${name}`);
  }
  return { name, use: { browserName: name } };
 });
}
