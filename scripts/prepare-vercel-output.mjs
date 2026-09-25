// The x64 Chromium package must run in an x64 Lambda even when built on an ARM Mac.
// Run after `vercel build --standalone`, before package checks and --prebuilt deploy.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve(process.argv[2] || '.vercel/output');
const file = path.join(output, 'functions/api/export-pdf.func/.vc-config.json');
const config = JSON.parse(await readFile(file, 'utf8'));
if (!config.runtime?.startsWith('nodejs')) throw new Error('Unexpected PDF runtime');
config.architecture = 'x86_64';
await writeFile(file, JSON.stringify(config, null, 2) + '\n');
console.log('PDF function pinned to x86_64 for bundled Chromium.');
