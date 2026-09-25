import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inspectPackage } from '../check-extension-package.mjs';
import { packageExtension } from '../package-extension.mjs';

test('packaging excludes stale compiler output, secrets, maps and unused type-only modules', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'rs-package-test-'));
  try {
    const source = join(temp, 'source');
    await cp(resolve('apps/extension'), source, { recursive: true });
    for (const file of ['dist/stale.js', 'dist/stale.js.map', 'dist/.env', 'icons/.DS_Store']) await writeFile(join(source, file), 'synthetic unwanted file');
    const result = await packageExtension(source, join(temp, 'output'));
    assert.equal(result.files.length, 16);
    assert(!result.files.some(file => /stale|\.env|DS_Store|types\.js/.test(file.path)));
    await rm(join(source, 'dist/lib/config.js'));
    await symlink(resolve('apps/extension/dist/lib/config.js'), join(source, 'dist/lib/config.js'));
    await assert.rejects(packageExtension(source, join(temp, 'output')), /symlink/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('artifact gate rejects extra permissions/files, CSP drift, maps, secret markers and development destinations', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'rs-artifact-test-'));
  try {
    const mutations = [
      async dir => { const path = join(dir, 'manifest.json'); const value = JSON.parse(await readFile(path)); value.host_permissions.push('<all_urls>'); await writeFile(path, JSON.stringify(value)); },
      async dir => { const path = join(dir, 'manifest.json'); const value = JSON.parse(await readFile(path)); value.permissions.push('tabs'); await writeFile(path, JSON.stringify(value)); },
      async dir => { const path = join(dir, 'manifest.json'); const value = JSON.parse(await readFile(path)); delete value.content_security_policy; await writeFile(path, JSON.stringify(value)); },
      async dir => writeFile(join(dir, '.env'), 'synthetic unwanted file'),
      async dir => writeFile(join(dir, 'dist/lib/sanitize.js'), '//# sourceMappingURL=data:application/json;base64,e30='),
      async dir => writeFile(join(dir, 'dist/lib/sanitize.js'), 'const token = "sk_live_syntheticfixtureonly";'),
      async dir => cp(resolve('apps/extension/dist/lib/config.js'), join(dir, 'dist/lib/config.js')),
      async dir => writeFile(join(dir, 'dist/lib/sanitize.js'), 'eval("untrusted")'),
      async dir => { const path = join(dir, 'dist/popup/popup.js'); await writeFile(path, (await readFile(path, 'utf8')) + '\n// For local testing, use localhost'); },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const dir = join(temp, String(index)); await mkdir(dir);
      await cp(resolve('dist/extension'), dir, { recursive: true });
      await mutate(dir);
      await assert.rejects(inspectPackage(dir), { name: 'AssertionError' });
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
