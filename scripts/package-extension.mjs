import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPackage, packageFiles } from './check-extension-package.mjs';

export async function packageExtension(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of packageFiles) {
    const sourceFile = file === 'manifest.json' ? 'manifest.production.json' : file;
    // Reject symlinks in every component, including dist/ and icons/.
    let component = source;
    for (const part of sourceFile.split('/')) {
      component = join(component, part);
      if ((await lstat(component)).isSymbolicLink()) throw new Error(`Package source symlink: ${file}`);
    }
    await mkdir(dirname(join(destination, file)), { recursive: true });
    await cp(join(source, sourceFile), join(destination, file));
  }
  for (const [file, before, after] of [
    ['dist/lib/config.js', "const devPorts = ['5173', '5183', '5185'];", 'const devPorts = [];'],
  ]) {
    const path = join(destination, file);
    const text = await readFile(path, 'utf8');
    if (text.split(before).length !== 2) throw new Error(`Production replacement changed; review ${file}`);
    await writeFile(path, text.replace(before, after));
  }
  return inspectPackage(destination);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const destination = join(root, 'dist/extension');
  const archive = join(root, 'dist/apwico-extension.zip');
  const report = join(root, 'dist/extension-package-report.json');
  await rm(archive, { force: true });
  await rm(report, { force: true });
  const result = await packageExtension(join(root, 'apps/extension'), destination);
  execFileSync('zip', ['-X', '-q', archive, ...packageFiles], { cwd: destination });
  execFileSync('unzip', ['-tq', archive]);
  const extracted = await mkdtemp(join(tmpdir(), 'apwico-package-'));
  try {
    execFileSync('unzip', ['-q', archive, '-d', extracted]);
    const inspected = await inspectPackage(extracted);
    if (JSON.stringify(result) !== JSON.stringify(inspected)) throw new Error('ZIP differs from reviewed folder');
  } finally { await rm(extracted, { recursive: true, force: true }); }
  const bytes = await readFile(archive);
  await writeFile(report, JSON.stringify({ ...result, archive: 'apwico-extension.zip', archiveBytes: bytes.length, archiveSha256: createHash('sha256').update(bytes).digest('hex') }, null, 2) + '\n');
  console.log(`Verified local folder and ZIP: ${result.files.length} files. See dist/extension-package-report.json. Not installed or submitted.`);
}
