import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.ASSET_BASE_URL ?? 'http://127.0.0.1:5195';
const root = resolve('marketing-assets');
const stillRoot = resolve(root, 'stills');
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const savedJobId = '99999999-9999-9999-9999-999999999999';
const versionId = '88888888-8888-8888-8888-888888888888';

const formats = {
  '16x9': { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 },
  '1x1': { viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 },
  '9x16': { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 },
};

const resume = {
  version: 1,
  name: 'Alex Morgan',
  headline: 'Customer Experience Specialist',
  email: 'alex.morgan@example.com',
  phone: '+44 7700 900123',
  location: 'Manchester, United Kingdom',
  website: 'alex.example/portfolio',
  summary: 'Customer experience specialist who supports diverse customers, improves everyday processes, and helps teams deliver a consistently welcoming service.',
  skills: 'Customer support, Team collaboration, Problem solving, CRM systems, English, Spanish',
  profileHeading: 'Profile',
  skillsHeading: 'Skills & languages',
  sections: [
    { id: 'experience', title: 'Experience', kind: 'experience', entries: [
      { id: 'role1', title: 'Customer Experience Specialist', organization: 'Example Company', location: 'Manchester, UK', dates: '2022 — Present', description: 'Support customers across email, phone, and live chat with clear, empathetic communication.\nPartner with the operations team to simplify common support processes.\nHelp new team members develop product knowledge and confidence.' },
      { id: 'role2', title: 'Customer Service Associate', organization: 'Sample Retail', location: 'Leeds, UK', dates: '2020 — 2022', description: 'Helped customers find the right products and resolve order questions.\nMaintained accurate records and coordinated with colleagues during busy periods.' },
    ] },
    { id: 'education', title: 'Education', entries: [
      { id: 'degree1', title: 'BA Business Management', organization: 'Example University', location: 'United Kingdom', dates: '2017 — 2020', description: '' },
    ] },
  ],
  template: 'modern', paper: 'A4', accent: '#20594a', direction: 'ltr', language: 'en', noExperience: false,
};

const session = {
  access_token: 'fictional-demo-token', refresh_token: 'fictional-demo-refresh', token_type: 'bearer', expires_in: 3600,
  expires_at: 4102444800,
  user: { id: owner, aud: 'authenticated', role: 'authenticated', email: 'alex.morgan@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' },
};

const snapshot = {
  id: 'demo:customer-success', provider: 'demo', providerJobId: 'fictional-001', dedupeKey: 'a'.repeat(64),
  title: 'Customer Success Specialist', company: 'Example Learning Co.',
  location: { value: { city: 'Manchester', region: null, country: 'GB' }, source: 'provider', confidence: 'medium' },
  workplace: { value: 'hybrid', source: 'provider', confidence: 'high' },
  employmentType: { value: 'full_time', source: 'provider', confidence: 'high' },
  salary: null,
  descriptionExcerpt: 'Support customers, document recurring issues, and collaborate with product teams.',
  descriptionText: 'Support customers across email and chat. Document recurring issues. Spanish is preferred. Experience with CRM migrations is useful. An active support certification is required.',
  postedAt: null, expiry: { expiresAt: null, isLikelyExpired: false, source: 'unknown', confidence: 'low' },
  sourceUrl: 'https://careers.example/customer-success-specialist', portal: 'fictional-careers', source: 'employer',
  retrievedAt: '2026-09-27T00:00:00Z', matchLabel: 'good', matchReasons: ['Your resume demonstrates customer-support experience.'],
};

const analysis = {
  version: 1, label: 'good', resumeHash: 'a'.repeat(64), jobHash: 'b'.repeat(64), contextHash: 'c'.repeat(64),
  whyPromising: 'Your resume shows relevant customer-support evidence, with a few areas still worth reviewing.',
  observations: ['Customer support is demonstrated in your resume.'],
  importantWarning: 'Important required qualification not demonstrated: active support certification.',
  seniorityMessage: null, additionalAreasAnalyzed: 3,
  clarification: { requirementId: '0123456789abcdef', text: 'An active support certification is required.' },
  fullAnalysis: {
    requirements: [
      { id: '1111111111111111', text: 'Support customers across email and chat.', category: 'required', status: 'demonstrated', evidence: ['Resume evidence: supported customers across email, phone, and live chat.'] },
      { id: '2222222222222222', text: 'Experience documenting recurring issues.', category: 'preferred', status: 'partially_demonstrated', evidence: ['Related resume wording: simplified common support processes.'] },
      { id: '3333333333333333', text: 'Active support certification.', category: 'required', status: 'not_demonstrated', evidence: [] },
    ],
    strengths: ['Customer support across multiple channels is clearly demonstrated.'],
    buriedEvidence: ['Process-improvement evidence could be easier to spot.'],
    areasWorthStrengthening: ['Required — not demonstrated: active support certification.'],
    constraints: ['Hybrid work matches the saved preference.'],
    deeperExplanation: 'Missing resume evidence remains unknown rather than proof that you lack the qualification.',
    tailoringAction: 'Tailor my resume for this job',
  },
};

const savedJob = {
  id: savedJobId, snapshot, providerAvailable: true, availabilityCheckedAt: '2026-09-27T00:00:00Z',
  unavailableAt: null, savedAt: '2026-09-27T00:00:00Z', analysisCurrent: true, analysisInvalidationReason: null,
  matchAnalysis: analysis,
};

function version(currentResume = resume, revision = 1) {
  return { id: versionId, savedJobId, jobSnapshot: snapshot, sourceMasterResumeId: null, sourceMasterRevision: null,
    sourceMasterFingerprint: 'd'.repeat(64), resume: currentResume, revision,
    createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z' };
}

async function prepare(page, { withSavedJob = true } = {}) {
  await page.addInitScript(([auth, draft]) => {
    localStorage.setItem('sb-auth-test-auth-token', JSON.stringify(auth));
    sessionStorage.setItem('resumestride.resume.v1', JSON.stringify(draft));
  }, [session, resume]);
  await page.route('https://auth-test.supabase.co/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('https://auth-test.supabase.co/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }));
  await page.route('https://va.vercel-scripts.com/**', route => route.abort());
  await page.route('**/api/export-status', route => route.fulfill({ json: { isPro: true, remaining: 3, resetsAt: '2026-10-27T00:00:00Z' } }));
  let created = false;
  let currentResume = resume;
  let revision = 1;
  await page.route('**/api/jobs-account', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'load') return route.fulfill({ json: {
      isPro: true, saveLimit: 10000, savedJobs: withSavedJob ? [savedJob] : [],
      jobResumeVersions: created ? [{ ...version(currentResume, revision), resume: undefined, savedJobExists: true }] : [],
      preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null },
    } });
    if (body.action === 'create_job_resume') { created = true; currentResume = body.resume; return route.fulfill({ json: { created: true, version: version(currentResume, revision) } }); }
    if (body.action === 'get_job_resume') return route.fulfill({ json: { version: version(currentResume, revision) } });
    if (body.action === 'update_job_resume') { currentResume = body.resume; revision += 1; return route.fulfill({ json: { version: version(currentResume, revision) } }); }
    return route.fulfill({ json: { saved: true } });
  });
  await page.route('**/api/jobs-search', route => route.fulfill({ json: {
    isPro: true, availableCount: 1, proLimit: 20,
    jobs: [{ id: snapshot.id, title: snapshot.title, company: snapshot.company,
      location: snapshot.location.value, workplace: snapshot.workplace.value, employmentType: snapshot.employmentType.value,
      salary: null, postedAt: null, portal: snapshot.portal, matchLabel: 'good', matchReasons: snapshot.matchReasons,
      matchAnalysis: analysis, sourceUrl: snapshot.sourceUrl, savedSnapshot: snapshot }],
  } }));
  await page.route('**/api/tailor', route => route.fulfill({ json: { suggestions: [
    { field: 'summary', sectionId: null, entryId: null, originalText: currentResume.summary,
      suggestedText: 'Customer experience specialist who supports customers across email and chat, documents recurring issues, and improves everyday support processes.',
      why: 'This connects existing customer-support and process-improvement evidence to the saved role without adding a new qualification.' },
    { field: 'skills', sectionId: null, entryId: null, originalText: currentResume.skills,
      suggestedText: currentResume.skills,
      why: 'The saved role prefers Spanish, which is already listed in this resume.' },
  ] } }));
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^(Continue my resume|Build my resume)$/, exact: true }).first().click();
}

async function openJobs(page) {
  await page.locator('.builder-sidebar').getByRole('button', { name: 'Find jobs', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Find jobs', exact: true }).waitFor();
}

async function startVersion(page) {
  await openJobs(page);
  await page.getByRole('button', { name: 'Tailor my resume for this job', exact: true }).click();
  await page.getByText(/Job-specific resume — Tailored for Customer Success Specialist/).waitFor();
}

async function showTailoring(page) {
  await startVersion(page);
  await page.getByRole('button', { name: 'Design & format', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('checkbox', { name: /I consent to sending this saved job-specific resume/ }).check();
  await page.getByRole('button', { name: 'Get tailoring suggestions', exact: true }).click();
  await page.locator('.suggestion-card').first().waitFor();
}

const stories = {
  '01-one-master-many-opportunities': {
    title: 'ONE MASTER. MORE THAN ONE VERSION.',
    caption: 'Create a separate resume for an opportunity while your master stays unchanged.',
    stage: async page => { await prepare(page); await startVersion(page); await page.getByRole('button', { name: 'Profile & skills', exact: true }).click(); },
    focus: '.builder',
  },
  '02-see-the-evidence': {
    title: 'SEE WHAT YOUR EXPERIENCE ALREADY PROVES.',
    caption: 'Connect each requirement to real resume evidence—without an ATS score or hiring prediction.',
    stage: async page => { await prepare(page); await openJobs(page); await page.getByText('Full evidence analysis').click(); await page.locator('.match-analysis').scrollIntoViewIfNeeded(); },
    focus: '.match-analysis',
  },
  '03-tailor-without-making-things-up': {
    title: 'AI SUGGESTS. YOU DECIDE.',
    caption: 'Review the source, then accept, reject, or edit every suggestion yourself.',
    stage: async page => { await prepare(page); await showTailoring(page); await page.locator('.suggestion-card').first().scrollIntoViewIfNeeded(); },
    focus: '.tailoring-panel',
  },
  '04-from-job-to-application': {
    title: 'FROM JOB TO APPLICATION.',
    caption: 'Save a role, inspect the match, open a separate resume, and tailor it under your control.',
    stage: async page => { await prepare(page); await openJobs(page); await page.locator('.saved-job-card').scrollIntoViewIfNeeded(); },
    focus: '.saved-job-card',
  },
  '05-seven-templates-same-experience': {
    title: 'SEVEN TEMPLATES. SAME EXPERIENCE.',
    caption: 'Switch the layout without changing your words, qualifications, or experience.',
    stage: async page => {
      await prepare(page, { withSavedJob: false });
      const trigger = page.locator('.preview-template-trigger');
      if (!(await trigger.isVisible())) await page.getByRole('button', { name: 'Preview resume', exact: true }).click();
      await trigger.click();
      await page.getByRole('heading', { name: 'Choose your layout', exact: true }).waitFor();
    },
    focus: '.template-picker',
  },
};

async function addFrame(page, slug, story, format) {
  if (format === '9x16' && slug === '03-tailor-without-making-things-up') {
    await page.evaluate(() => window.scrollBy(0, 260));
  }
  const verticalComposition = format !== '9x16' ? ''
    : slug === '02-see-the-evidence' ? '.match-analysis{zoom:.72;width:138%}'
    : slug === '05-seven-templates-same-experience' ? '.template-picker{padding:12px}.template-picker-heading{padding-bottom:10px}.template-picker-heading h2{font-size:24px}.template-picker-heading p:last-child{font-size:10px}.template-picker-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:12px}.template-option-preview{aspect-ratio:210/115}.template-option-copy{padding:6px}.template-option-copy>span{font-size:10px;flex-direction:row}.template-option-copy small{font-size:8px}'
    : '';
  await page.addStyleTag({ content: `
    * { caret-color: transparent !important; }
    #growth-demo-frame { position: fixed; z-index: 2147483647; pointer-events: none; inset: 0; border: 10px solid #0b0a09; }
    #growth-demo-title { position: fixed; z-index: 2147483647; pointer-events: none; top: 22px; left: 24px; max-width: min(680px, calc(100vw - 48px)); padding: 12px 16px; border-radius: 10px; color: #f6f5f2; background: rgba(11,10,9,.94); font: 650 15px/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .08em; }
    #growth-demo-foot { position: fixed; z-index: 2147483647; pointer-events: none; left: 24px; bottom: 22px; max-width: min(760px, calc(100vw - 48px)); padding: 12px 16px; border-radius: 10px; color: #f6f5f2; background: rgba(11,10,9,.94); font: 500 14px/1.35 system-ui, sans-serif; }
    #growth-demo-foot small { display:block; margin-top:4px; color:#b7decf; font: 500 10px/1.3 ui-monospace, SFMono-Regular, monospace; letter-spacing:.06em; text-transform:uppercase; }
    ${format === '9x16' ? '#growth-demo-title{font-size:12px;top:14px;left:14px;right:14px}.site-header{display:none!important}#growth-demo-foot{font-size:11px;left:14px;right:14px;bottom:14px}' : ''}
    ${verticalComposition}
  ` });
  await page.evaluate(({ title, caption }) => {
    const frame = document.createElement('div'); frame.id = 'growth-demo-frame';
    const heading = document.createElement('div'); heading.id = 'growth-demo-title'; heading.textContent = title;
    const foot = document.createElement('div'); foot.id = 'growth-demo-foot'; foot.textContent = caption;
    const note = document.createElement('small'); note.textContent = 'Fictional demonstration data · ResumeStride'; foot.append(note);
    const host = document.querySelector('dialog[open]') ?? document.body;
    host.append(frame, heading, foot);
  }, { title: story.title, caption: story.caption });
}

await Promise.all(Object.keys(formats).map(format => mkdir(resolve(stillRoot, format), { recursive: true })));
const browser = await chromium.launch();
const results = [];
try {
  for (const [slug, story] of Object.entries(stories)) {
    for (const [format, settings] of Object.entries(formats)) {
      const context = await browser.newContext(settings);
      const page = await context.newPage();
      const errors = [];
      const sensitiveRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        const url = request.url();
        if (!url.startsWith(baseURL) && !url.startsWith('https://auth-test.supabase.co')
          && !url.startsWith('https://fonts.googleapis.com/') && !url.startsWith('https://fonts.gstatic.com/')
          && !url.startsWith('https://va.vercel-scripts.com/')) sensitiveRequests.push(url);
      });
      await story.stage(page);
      await addFrame(page, slug, story, format);
      await page.waitForTimeout(300);
      const path = resolve(stillRoot, format, `${slug}.png`);
      await page.screenshot({ path, animations: 'disabled' });
      const visibleText = (await page.locator(story.focus).innerText()).slice(0, 12000);
      results.push({ slug, format, path: path.replace(`${root}/`, ''), width: settings.viewport.width * settings.deviceScaleFactor,
        height: settings.viewport.height * settings.deviceScaleFactor, errors, unexpectedExternalRequests: sensitiveRequests,
        containsLocalhostText: /localhost|127\.0\.0\.1/i.test(visibleText),
        containsDebugText: /devtools|debug control|design lab|password protection/i.test(visibleText),
        containsFictionalDisclosure: true });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(resolve(root, 'stills', 'verification.json'), JSON.stringify({ generatedAt: new Date().toISOString(), baseURL, results }, null, 2));
if (results.some(result => result.errors.length || result.unexpectedExternalRequests.length || result.containsLocalhostText || result.containsDebugText)) process.exitCode = 1;
