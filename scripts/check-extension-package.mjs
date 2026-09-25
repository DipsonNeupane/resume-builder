import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Reviewed runtime allowlist: never recursively copy compiler output or the repository.
export const packageFiles = [
  'manifest.json', 'popup.html', 'popup.css',
  ...[16, 32, 48, 128].map(size => `icons/icon-${size}.png`),
  'dist/background/worker.js', 'dist/inject/extract-job.js', 'dist/popup/popup.js',
  ...['capture', 'config', 'delivery', 'diagnostics', 'pending', 'sanitize'].map(name => `dist/lib/${name}.js`),
].sort();

export async function inspectPackage(root) {
  const actual = [];
  async function walk(relative = '') {
    for (const name of await readdir(resolve(root, relative))) {
      const path = posix.join(relative, name);
      const stat = await lstat(resolve(root, path));
      assert(!stat.isSymbolicLink(), `Symlink forbidden: ${path}`);
      if (stat.isDirectory()) await walk(path);
      else { assert(stat.isFile(), `Non-file: ${path}`); actual.push(path); }
    }
  }
  await walk();
  assert.deepEqual(actual.sort(), packageFiles, 'Package must contain exactly the reviewed runtime files');
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), ['manifest_version', 'name', 'version', 'description', 'action', 'permissions', 'host_permissions', 'background', 'minimum_chrome_version', 'content_security_policy', 'icons'].sort(), 'Review any new manifest capability');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'ResumeStride Job Capture');
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
  assert(manifest.version.split('.').every(part => Number(part) <= 65535));
  assert(manifest.description.length > 0 && manifest.description.length <= 132);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage', 'alarms']);
  assert.deepEqual(manifest.host_permissions, ['https://resumestride.com/*']);
  assert.deepEqual(manifest.background, { service_worker: 'dist/background/worker.js', type: 'module' });
  assert.equal(manifest.minimum_chrome_version, '120');
  assert.deepEqual(manifest.content_security_policy, { extension_pages: "script-src 'self'; object-src 'none';" });
  assert.equal(manifest.action.default_popup, 'popup.html');
  const icons = Object.fromEntries([16, 32, 48, 128].map(size => [size, `icons/icon-${size}.png`]));
  assert.deepEqual(manifest.icons, icons);
  assert.deepEqual(manifest.action.default_icon, icons);

  const files = [];
  for (const path of actual) {
    const data = await readFile(resolve(root, path));
    assert(data.length < 256 * 1024, `Unexpected size: ${path}`);
    if (path.endsWith('.png')) {
      assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      const size = Number(path.match(/icon-(\d+)/)[1]);
      assert.equal(data.readUInt32BE(16), size);
      assert.equal(data.readUInt32BE(20), size);
    } else {
      const text = data.toString('utf8');
      // Defense in depth, not a proof against arbitrary/obfuscated secrets or code.
      assert(!/sourceMappingURL|sourceURL\s*=|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk_(?:live|test)_|sk-proj-|sb_secret_)[A-Za-z0-9_-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text), `Secret/source-map marker in ${path}`);
      assert(!/\beval\s*\(|\bnew\s+Function\s*\(|\bimportScripts\s*\(|\bimport\s*\(|<script[^>]+src=["']https?:/.test(text), `Executable loading requires review: ${path}`);
      if (path.endsWith('.js')) {
        for (const match of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
          assert(match[1].startsWith('.'), `Non-local import in ${path}`);
          assert(packageFiles.includes(posix.normalize(posix.join(posix.dirname(path), match[1]))), `Missing import in ${path}`);
        }
      }
    }
    files.push({ path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  }
  const configText = await readFile(resolve(root, 'dist/lib/config.js'), 'utf8');
  assert(configText.includes('const devPorts = [];'), 'Development destination allowlist remains');
  // Execute only the reviewed local configuration module to verify packaged behavior.
  const config = await import(`${pathToFileURL(resolve(root, 'dist/lib/config.js')).href}?audit=${Date.now()}`);
  assert.equal(config.productionAppOrigin, 'https://resumestride.com');
  assert.equal(config.defaultAppUrl, 'https://resumestride.com/');
  assert(config.isAllowedAppUrl(new URL(config.defaultAppUrl)));
  for (const url of ['http://resumestride.com/', 'https://www.resumestride.com/', 'https://resumestride.com.evil.test/', 'https://user@resumestride.com/', 'https://resumestride.com/path', 'https://resumestride.com/?q=1', 'https://resumestride.com/#capture', 'https://resumestride.com:444/', ...['localhost', '127.0.0.1'].flatMap(host => ['5173', '5183', '5185'].map(port => `http://${host}:${port}/`))]) {
    assert.equal(config.isAllowedAppUrl(new URL(url)), false, 'Unsafe destination accepted');
  }
  const popup = await readFile(resolve(root, 'dist/popup/popup.js'), 'utf8');
  assert(popup.includes('This production package sends only to https://resumestride.com/.'));
  assert(popup.includes('Enter the official app URL: https://resumestride.com/'));
  assert(popup.includes('Use https://resumestride.com/ with no credentials, query or fragment. Other destinations are not supported.'));
  assert(popup.includes('Could not open or reach ResumeStride. Check your connection and try again.'));
  assert(!/local testing|local server|localhost|127\.0\.0\.1/i.test(popup), 'Development guidance remains in production popup');
  return { name: manifest.name, version: manifest.version, files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/extension');
  const result = await inspectPackage(root);
  console.log(`PASS: ${result.name} ${result.version}; ${result.files.length} reviewed files, ${result.totalBytes} bytes; package security checks passed.`);
}
