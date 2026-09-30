import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { basename, join } from 'node:path';

const root = process.cwd();
const fail = [];
const report = [];
const budget = (label, files, rawLimit, gzipLimit) => {
 const buffers = files.map(file => readFileSync(file));
 const raw = buffers.reduce((sum, value) => sum + value.length, 0);
 const gzip = buffers.reduce((sum, value) => sum + gzipSync(value).length, 0);
 report.push(`${label}: ${(raw / 1024).toFixed(1)} KiB raw / ${(gzip / 1024).toFixed(1)} KiB gzip`);
 if (raw > rawLimit) fail.push(`${label} raw ${raw} > ${rawLimit}`);
 if (gzip > gzipLimit) fail.push(`${label} gzip ${gzip} > ${gzipLimit}`);
};

const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
const initialScripts = [...html.matchAll(/<script[^>]+src="\/([^"?]+\.js)"/g)].map(match => join(root, 'dist', match[1]));
const modulePreloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"?]+\.js)"/g)].map(match => join(root, 'dist', match[1]));
const initialStyles = [...html.matchAll(/<link[^>]+href="\/([^"?]+\.css)"/g)].map(match => join(root, 'dist', match[1]));
if (!initialScripts.length) fail.push('No initial application script found in dist/index.html.');
budget('Homepage initial JavaScript', [...new Set([...initialScripts, ...modulePreloads])], 670 * 1024, 195 * 1024);
budget('Homepage initial CSS', initialStyles, 210 * 1024, 38 * 1024);

const toolFiles = ['analysis.js', 'public-tools.js', 'tool-analytics.js'].map(file => join(root, 'public/tools', file));
budget('Public matcher JavaScript', toolFiles, 30 * 1024, 10 * 1024);

const assets = readdirSync(join(root, 'dist/assets'));
for (const feature of ['JobsPanel-', 'FictionalSample-', 'GeneratedPdfControls-', 'pdfImport-', 'docx-']) {
 if (!assets.some(file => file.startsWith(feature) && file.endsWith('.js'))) fail.push(`${feature.slice(0, -1)} must remain a deferred chunk.`);
}
const entryNames = new Set(initialScripts.map(file => basename(file)));
for (const file of modulePreloads) entryNames.add(basename(file));
for (const name of entryNames) {
 if (/JobsPanel|FictionalSample|GeneratedPdfControls|pdfImport|docx/.test(name)) fail.push(`Deferred feature leaked into initial entry: ${name}`);
}

for (const line of report) console.log(`[performance budget] ${line}`);
if (fail.length) {
 for (const item of fail) console.error(`[performance budget] FAIL: ${item}`);
 process.exit(1);
}
console.log('[performance budget] PASS — static lab artifact budgets and deferred boundaries hold.');
