import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const roots = ['src', 'server', 'api', 'apps', 'scripts', 'public', 'tests', 'template-library']
const rootFiles = ['index.html', 'middleware.ts', 'vite.config.ts', 'package.json', 'package-lock.json', '.env.example', 'README.md']
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html', '.css', '.md', '.xml', '.txt'])
const ignoredDirectories = new Set(['node_modules', 'dist', '.git', 'coverage', 'test-results', 'playwright-report'])

async function filesUnder(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(path))
    else if (textExtensions.has(extname(entry.name))) files.push(path)
  }
  return files
}

const files = [...rootFiles.map(file => join(root, file))]
for (const directory of roots) files.push(...await filesUnder(join(root, directory)))

const publicIdentityExceptions = new Set([
  'src/brand.ts',
  'server/export/document-handler.ts',
  // Deliberate migration boundaries: the old-origin notice names the product
  // users are leaving, and the mutation guard accepts only the exact legacy
  // origins while both domains coexist.
  'src/main.tsx',
  'server/http/security.ts',
  'scripts/check-brand-migration.mjs',
  // Negative UI assertions intentionally name the legacy brand to prove it is absent.
  'tests/brand.spec.ts',
])
const legacyDomainExceptions = new Set([
  'src/brand.ts',
  'middleware.ts',
  'src/main.tsx',
  'server/http/security.ts',
  'src/services/extensionImport.ts',
  'apps/extension/src/lib/config.ts',
  'apps/extension/manifest.json',
  'apps/extension/manifest.production.json',
  'scripts/check-brand-migration.mjs',
  'scripts/check-extension-package.mjs',
  'scripts/package-extension.mjs',
])
const publicTechnicalExceptions = new Set([
  'public/content-analytics.js',
  'public/tools/tool-analytics.js',
  'public/tools/public-tools.js',
  'public/extension-fixture/job-posting.html',
])

const violations = []
let intentionalLegacyReferences = 0
const contents = await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')]))
for (const [file, text] of contents) {
  const path = relative(root, file)
  const legacyNameCount = (text.match(/ResumeStride/g) || []).length
  const legacyDomainCount = (text.match(/(?:www\.)?resumestride\.com/g) || []).length
  const legacyTechnicalCount = (text.match(/(?:resumestride[:._-]|x-resumestride-)/g) || []).length
  intentionalLegacyReferences += legacyNameCount + legacyDomainCount + legacyTechnicalCount
  if (legacyNameCount && !publicIdentityExceptions.has(path)) violations.push(`${path}: public legacy name (${legacyNameCount})`)
  if (legacyDomainCount && !legacyDomainExceptions.has(path) && !path.startsWith('tests/')) violations.push(`${path}: legacy domain outside compatibility boundary (${legacyDomainCount})`)
  if (path.startsWith('public/') && /resumestride/i.test(text) && !publicTechnicalExceptions.has(path)) violations.push(`${path}: public lowercase legacy brand outside technical compatibility boundary`)
  if (/support@resumestride\.com/.test(text)) violations.push(`${path}: legacy support address`)
}

const required = [
  ['index.html', /APWICO/],
  ['middleware.ts', /https:\/\/apwico\.com/],
  ['public/sitemap.xml', /https:\/\/apwico\.com/],
  ['public/robots.txt', /https:\/\/apwico\.com\/sitemap\.xml/],
  ['package.json', /"name": "apwico"/],
]
for (const [path, pattern] of required) {
  const text = await readFile(join(root, path), 'utf8')
  if (!pattern.test(text)) violations.push(`${path}: missing required APWICO identity`)
}

if (violations.length) {
  console.error(`APWICO migration check failed:\n${violations.map(item => `- ${item}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`APWICO migration check PASS. Intentional legacy compatibility references: ${intentionalLegacyReferences}.`)
}
