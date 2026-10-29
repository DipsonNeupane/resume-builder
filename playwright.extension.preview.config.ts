import { defineConfig } from '@playwright/test';
import extensionConfig from './playwright.extension.config';

// Stable release-candidate verification against the already-built web app. The ordinary
// extension config intentionally keeps Vite development mode for day-to-day iteration.
export default defineConfig({
  ...extensionConfig,
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 5185 --strictPort',
    url: 'http://127.0.0.1:5185',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
