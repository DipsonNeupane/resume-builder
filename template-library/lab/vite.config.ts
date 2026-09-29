import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

// Isolated Template Lab. Not part of the production build. Run from the repo root:
//   npx vite --config template-library/lab/vite.config.ts
const repo = fileURLToPath(new URL('../..', import.meta.url));
// src/styles.css @imports the marketing site's web fonts; resume templates never use
// them. Strip remote @imports so the Lab (like the PDF renderer) makes no network requests.
const offline: Plugin = { name: 'template-lab-offline', enforce: 'pre', transform(code, id) { return id.endsWith('/src/styles.css') ? code.replace(/@import\s+url\((['"]?)https?:[^)]*\1\)[^;]*;/g, '') : undefined; } };
export default defineConfig({
 root: fileURLToPath(new URL('.', import.meta.url)),
 cacheDir: `${repo}node_modules/.vite-template-lab`,
 plugins: [offline],
 server: { host: '127.0.0.1', port: 5178, strictPort: true, fs: { allow: [repo] } },
});
