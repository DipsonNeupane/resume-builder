import { defineConfig } from '@playwright/test';
// Fixture-only extraction can run without a local app server or any live provider.
export default defineConfig({ testDir: './tests/extension', testMatch: ['greenhouse.spec.ts', 'structured.spec.ts'], use: { headless: true }, reporter: 'list' });
