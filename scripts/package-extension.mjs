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
    ['dist/popup/popup.js', 'Defaults to the production ResumeStride site. For local testing, use http://localhost or http://127.0.0.1 on port 5173, 5183, or 5185.', 'This production package sends only to https://resumestride.com/.'],
    ['dist/popup/popup.js', 'Enter a valid app URL, e.g. http://localhost:5173/', 'Enter the official app URL: https://resumestride.com/'],
    ['dist/popup/popup.js', 'Use https://resumestride.com, or for local testing http://localhost or http://127.0.0.1 on port 5173, 5183 or 5185 — with path / and no credentials, query or fragment.', 'Use https://resumestride.com/ with no credentials, query or fragment. Other destinations are not supported.'],
    ['dist/popup/popup.js', 'Could not open or reach ResumeStride. Check the local server and try again.', 'Could not open or reach ResumeStride. Check your connection and try again.'],
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
  const archive = join(root, 'dist/resumestride-extension.zip');
  const report = join(root, 'dist/extension-package-report.json');
  await rm(archive, { force: true });
  await rm(report, { force: true });
  const result = await packageExtension(join(root, 'apps/extension'), destination);
  execFileSync('zip', ['-X', '-q', archive, ...packageFiles], { cwd: destination });
  execFileSync('unzip', ['-tq', archive]);
  const extracted = await mkdtemp(join(tmpdir(), 'resumestride-package-'));
  try {
    execFileSync('unzip', ['-q', archive, '-d', extracted]);
    const inspected = await inspectPackage(extracted);
    if (JSON.stringify(result) !== JSON.stringify(inspected)) throw new Error('ZIP differs from reviewed folder');
  } finally { await rm(extracted, { recursive: true, force: true }); }
  const bytes = await readFile(archive);
  await writeFile(report, JSON.stringify({ ...result, archive: 'resumestride-extension.zip', archiveBytes: bytes.length, archiveSha256: createHash('sha256').update(bytes).digest('hex') }, null, 2) + '\n');
  console.log(`Verified local folder and ZIP: ${result.files.length} files. See dist/extension-package-report.json. Not installed or submitted.`);
}
