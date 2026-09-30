import { spawnSync } from 'node:child_process';

const profile = process.argv[2] ?? 'all';
if (!['all', 'static', 'browser'].includes(profile)) {
  console.error('Usage: node scripts/run-quality-gate.mjs [all|static|browser]');
  process.exit(2);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = process.execPath;
const steps = {
  static: [
    ['Production build and client type check', npm, ['run', 'build']],
    ['Public-route performance artifact budgets', npm, ['run', 'performance:budgets']],
    ['Server type check', npm, ['run', 'check:server']],
    ['SEO, metadata, sitemap, structured data and link policy', npm, ['run', 'test:seo']],
    ['Typed route, continuation and private-state boundary tests', node, ['--import', 'tsx', '--test', 'tests/server/navigation.test.ts', 'tests/server/routes.test.ts', 'tests/server/shared-discovery.test.ts']],
    ['PDF/Word request and Word round-trip smoke tests', node, ['--import', 'tsx', '--test', 'tests/server/export.test.ts', 'tests/server/docx.test.ts']],
  ],
  browser: [
    ['Public console, homepage, templates, onboarding, accessibility, overflow, keyboard, motion and route checks', npm, ['exec', '--', 'playwright', 'test', 'tests/public-quality.spec.ts', 'tests/homepage.spec.ts', 'tests/shared-discovery.spec.ts', 'tests/accessibility.spec.ts', 'tests/navigation.spec.ts', 'tests/seo.spec.ts']],
    ['Built public sample and performance policy', npm, ['exec', '--', 'playwright', 'test', '--config', 'playwright.public-preview.config.ts']],
    ['Owner-scoped saved-object restoration, history and account isolation', npm, ['exec', '--', 'playwright', 'test', '--config', 'playwright.paid.config.ts', 'tests/paid/jobs.spec.ts', '--grep', 'saved Match Analysis|owner-scoped job-specific|local job draft is set aside|transient job-specific|private object routes|saved-object restoration failure|second account never inherits']],
    ['Cloud-master recovery gate for saved versions', npm, ['exec', '--', 'playwright', 'test', '--config', 'playwright.auth.config.ts', 'tests/auth/resumes.spec.ts', '--grep', 'job-specific deep link|failed initial cloud-resume check']],
    ['Mocked PDF/Word browser workflow', npm, ['exec', '--', 'playwright', 'test', '--config', 'playwright.paid.config.ts', 'tests/paid/flows.spec.ts', '--grep', 'PDF and Word use shared server availability|selected preview template is sent unchanged']],
    ['Generated PDF text smoke test', node, ['--import', 'tsx', 'scripts/check-generated-pdfs.ts', '--smoke']],
  ],
};

const selected = profile === 'all' ? [...steps.static, ...steps.browser] : steps[profile];
const started = Date.now();

for (const [label, command, args] of selected) {
  console.log(`\n[quality gate] ${label}`);
  const result = spawnSync(command, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
  if (result.error) {
    console.error(`[quality gate] ERROR: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[quality gate] FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\n[quality gate] PASS (${selected.length} checks, ${Math.round((Date.now() - started) / 1000)}s)`);
