import { defineConfig } from '@playwright/test';
import { browserProjects } from './playwright.browsers';

// Production-output verification for public routes. `quality:gate` builds first;
// this server only serves the already-built local dist and never deploys it.
export default defineConfig({
 projects: browserProjects(),
 testDir: './tests',
 testMatch: [
  'sample.spec.ts',
  'performance.spec.ts',
  'shared-discovery.spec.ts',
  'public-quality.spec.ts',
  'navigation.spec.ts',
  'g4-commercial.spec.ts',
 ],
 use: { baseURL: 'http://127.0.0.1:5184', headless: true },
 webServer: { command: 'npm exec -- vite preview --host 127.0.0.1 --port 5184 --strictPort', url: 'http://127.0.0.1:5184', reuseExistingServer: false, timeout: 300_000 },
 reporter: 'list',
});
