import { defineConfig } from '@playwright/test';
// Dedicated suite/port for the browser-extension foundation tests (tests/extension), kept out
// of the default `npm test` run (see playwright.config.ts's testIgnore) so those tests — which
// depend on apps/extension/dist being built first — never fail an unrelated `npm test` run just
// because `npm run build:extension` hasn't been run. Run via `npm run test:extension`, which
// builds the extension first. Port 5185 is distinct from 5173 (interactive dev), 5183 (default
// suite) and 5174 (auth suite).
export default defineConfig({
  testDir: './tests/extension',
  // The synced development checkout can need a cold Vite transform before the
  // first app-backed extension test. Keep the functional assertions bounded,
  // while avoiding false failures caused by filesystem hydration.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: 0,
  // Extension action, session-storage and receiver tests intentionally share one
  // local app server. Serial execution prevents concurrent persistent browser
  // profiles from starving that server and makes the release gate deterministic.
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5185', headless: true },
  projects: [
    { name: 'extension', grepInvert: /@toolbar/ },
    {
      name: 'toolbar',
      testMatch: 'installed.spec.ts',
      grep: /@toolbar/,
      // Real Chrome action popups close on focus loss. Keep the action isolated
      // until its extraction has persisted. The test observes session storage,
      // not a popup Page event.
      dependencies: ['extension'],
      workers: 1,
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5185 --strictPort',
    url: 'http://127.0.0.1:5185',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
  },
  reporter: 'list',
});
