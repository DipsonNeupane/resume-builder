import { defineConfig } from '@playwright/test';
// Dedicated suite/port for the browser-extension foundation tests (tests/extension), kept out
// of the default `npm test` run (see playwright.config.ts's testIgnore) so those tests — which
// depend on apps/extension/dist being built first — never fail an unrelated `npm test` run just
// because `npm run build:extension` hasn't been run. Run via `npm run test:extension`, which
// builds the extension first. Port 5185 is distinct from 5173 (interactive dev), 5183 (default
// suite) and 5174 (auth suite).
export default defineConfig({
  testDir: './tests/extension',
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5185', headless: true },
  projects: [
    { name: 'extension', grepInvert: /@toolbar/ },
    {
      name: 'toolbar',
      testMatch: 'installed.spec.ts',
      grep: /@toolbar/,
      // Real Chrome action popups close on focus loss. Other workers launching or
      // activating Chromium windows can dismiss one even in a separate profile.
      // A per-file serial mode/worker limit alone would still overlap those workers.
      // Keep ordinary tests parallel, then isolate the action until its extraction
      // has persisted. The test observes session storage, not a popup Page event.
      dependencies: ['extension'],
      workers: 1,
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5185 --strictPort',
    url: 'http://127.0.0.1:5185',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
  },
  reporter: 'list',
});
