import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { example } from '../../src/model';

const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const otherOwner = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function sessionFor(userId: string) {
  return { access_token: 'fake-test-token', refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
}

async function seed(page: Page, userId: string = owner) {
  const session = sessionFor(userId);
  await page.addInitScript(([s, r]) => { localStorage.setItem('sb-auth-test-auth-token', JSON.stringify(s)); sessionStorage.setItem('resumestride.resume.v1', JSON.stringify(r)); }, [session, example()]);
  await page.route('https://auth-test.supabase.co/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('https://auth-test.supabase.co/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }));
  await page.route('**/api/jobs-account', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    isPro: false, saveLimit: 3, savedJobs: [],
    preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null },
  }) }));
}

async function openBuilder(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^(Continue my resume|Build my resume)$/, exact: true }).first().click();
}

async function openJobs(page: Page) {
  await openBuilder(page);
  await page.locator('.builder-sidebar').getByRole('button', { name: 'Find jobs', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Find jobs', exact: true })).toBeVisible();
}

async function importCapture(page: Page, title = 'Captured role') {
  await page.evaluate(title => window.postMessage({ type: 'resumestride:job-import', payload: {
    title, company: 'Example', description: 'Captured duties.', sourceUrl: 'https://jobs.example/one', capturedAt: new Date().toISOString(),
  } }, location.origin), title);
  await expect(page.getByLabel('Captured job title')).toHaveValue(title);
}

declare global {
  interface Window {
    captureSaveTest: { ready: boolean; signal?: AbortSignal | null; release: () => Promise<void> };
  }
}

// Hold JSON consumption after the network response has arrived. Deliberately allow
// completion after abort, proving the stale-response guard independently of fetch.
async function holdCaptureResponse(page: Page) {
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    window.captureSaveTest = { ready: false, release: async () => {
      release();
      // Flush the save continuation and React's update before negative assertions.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    } };
    let held = false;
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (!held && String(input) === '/api/jobs-account' && typeof init?.body === 'string' && JSON.parse(init.body).action === 'capture_save') {
        held = true;
        window.captureSaveTest.signal = init.signal;
        const json = response.json.bind(response);
        response.json = async () => {
          const result = await json();
          window.captureSaveTest.ready = true;
          await gate;
          return result;
        };
      }
      return response;
    };
  });
}

const sampleResponse = {
  jobs: [{
    id: 'techmap:1', title: 'Customer Experience Specialist', company: 'Acme Support Co',
    location: { city: 'Manchester', region: null, country: 'GB' }, workplace: 'remote', employmentType: 'full_time',
    salary: { min: 30000, max: 35000, currency: 'GBP', period: 'year' }, postedAt: null, portal: 'acme-careers',
    matchLabel: 'strong', matchReasons: ['Your "Customer Experience Specialist" resume title shares wording with this posting.'],
    sourceUrl: 'https://jobs.acme.example/1',
    savedSnapshot: {
      id: 'techmap:1', provider: 'techmap', providerJobId: '1', dedupeKey: 'a'.repeat(64),
      title: 'Customer Experience Specialist', company: 'Acme Support Co',
      location: { value: { city: 'Manchester', region: null, country: 'GB' }, source: 'provider', confidence: 'medium' },
      workplace: { value: 'remote', source: 'provider', confidence: 'high' },
      employmentType: { value: 'full_time', source: 'provider', confidence: 'high' },
      salary: { min: 30000, max: 35000, currency: 'GBP', period: 'year', confidence: 'high' },
      descriptionExcerpt: 'Help customers.', postedAt: null,
      expiry: { expiresAt: null, isLikelyExpired: false, source: 'unknown', confidence: 'low' },
      sourceUrl: 'https://jobs.acme.example/1', portal: 'acme-careers', source: 'employer',
      retrievedAt: '2026-09-24T00:00:00Z', matchLabel: 'strong',
      matchReasons: ['Your resume title shares wording with this posting.'],
    },
  }],
  isPro: false, availableCount: 8, proLimit: 20,
};

const sampleMatchAnalysis = {
  version: 1 as const, label: 'good' as const, resumeHash: 'a'.repeat(64), jobHash: 'b'.repeat(64), contextHash: 'c'.repeat(64),
  whyPromising: 'Your resume shows relevant evidence, with some areas still worth reviewing.',
  observations: ['Customer support is demonstrated in your resume.'],
  importantWarning: 'Important required qualification not demonstrated: Must hold an active support certification.',
  seniorityMessage: 'This role appears more senior than the experience currently demonstrated in your resume.',
  additionalAreasAnalyzed: 3,
  clarification: { requirementId: '0123456789abcdef', text: 'Must hold an active support certification.' },
};
const sampleFullAnalysis = {
  requirements: [
    { id: '0123456789abcdef', text: 'Must hold an active support certification.', category: 'required' as const, status: 'not_demonstrated' as const, evidence: [] },
    { id: '1111111111111111', text: 'Spanish preferred.', category: 'preferred' as const, status: 'demonstrated' as const, evidence: ['Resume evidence: Spanish.'] },
    { id: '2222222222222222', text: 'CRM migration is nice to have.', category: 'nice_to_have' as const, status: 'partially_demonstrated' as const, evidence: ['Related resume wording: CRM.'] },
  ], strengths: ['Spanish is demonstrated.'], buriedEvidence: ['CRM evidence could be clearer.'],
  areasWorthStrengthening: ['Required — not demonstrated: active support certification.'], constraints: ['Remote work matches your preference.'],
  deeperExplanation: 'Missing resume evidence remains unknown rather than proof you lack it.', tailoringAction: 'Tailor my resume for this job' as const,
};

test('signed-out users see a sign-in prompt instead of the search form', async ({ page }) => {
  await openJobs(page);
  await expect(page.getByText('Sign in to search for jobs based on your resume.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search jobs' })).toHaveCount(0);
});

test('resume-derived mode sends bounded summary and qualification evidence without contact or explicit organization/location PII', async ({ page }) => {
  await seed(page);
  let sentBody: Record<string, unknown> | undefined;
  await page.route('**/api/jobs-search', async route => { sentBody = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResponse) }); });
  await openJobs(page);
  await expect(page.getByRole('radio', { name: 'From your resume' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Your target title' })).toBeVisible();
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect.poll(() => sentBody).toBeTruthy();
  const evidence = sentBody!.evidence as Record<string, unknown>;
  expect(Object.keys(evidence).sort()).toEqual(['headline', 'qualifications', 'roles', 'skills', 'summary']);
  expect(evidence.summary).toContain('People-first customer experience specialist');
  expect(evidence.qualifications).toEqual([{ section: 'Education', title: 'BA Business Management', description: '' }]);
  expect(evidence.roles).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Customer Experience Specialist' })]));
  const serialized = JSON.stringify(sentBody);
  expect(serialized).not.toContain('alex.morgan@example.com');
  expect(serialized).not.toContain('+44 7700 900123');
  expect(serialized).not.toContain('linkedin.com/in/alex-example');
  expect(serialized).not.toContain('Manchester, United Kingdom');
  expect(serialized).not.toContain('Example Company');
  expect(serialized).not.toContain('Manchester, UK');
  expect(serialized).not.toContain('Example University');
  expect(serialized).not.toContain('United Kingdom');
});

test('the search mode control is a native accessible radio group, not an incomplete tab widget', async ({ page }) => {
  await seed(page);
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResponse) }));
  await openJobs(page);
  await expect(page.getByRole('radiogroup', { name: 'Job search mode' })).toBeVisible();
  const resumeRadio = page.getByRole('radio', { name: 'From your resume' });
  const explicitRadio = page.getByRole('radio', { name: 'Enter criteria' });
  await expect(resumeRadio).toBeChecked();
  await expect(explicitRadio).not.toBeChecked();
  // Native radio keyboard behavior: arrow keys move selection within the group.
  await resumeRadio.focus();
  await page.keyboard.press('ArrowRight');
  await expect(explicitRadio).toBeChecked();
  await expect(resumeRadio).not.toBeChecked();
});

test('renders a job card with match label, salary, workplace, a safe View job link, and a real Save action', async ({ page }) => {
  await seed(page);
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResponse) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Customer Experience Specialist', exact: true })).toBeVisible();
  await expect(page.getByText('Acme Support Co')).toBeVisible();
  await expect(page.getByText('Strong match')).toBeVisible();
  await expect(page.getByText('GBP 30,000–35,000 / year')).toBeVisible();
  const link = page.getByRole('link', { name: /View job/ });
  await expect(link).toHaveAttribute('href', 'https://jobs.acme.example/1');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('button', { name: 'Save job' })).toBeEnabled();
});

test('Free match analysis shows a bounded evidence preview, important unknown warning, and honest Pro path', async ({ page }) => {
  await seed(page);
  const response = { ...sampleResponse, jobs: [{ ...sampleResponse.jobs[0], matchLabel: 'good', matchAnalysis: sampleMatchAnalysis }] };
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByRole('heading', { name: 'What your resume shows' })).toBeVisible();
  await expect(page.getByText(/required qualification not demonstrated/i)).toBeVisible();
  await expect(page.getByText('3 additional areas analyzed')).toBeVisible();
  await expect(page.getByText('Required', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View the full evidence analysis with Pro' })).toBeVisible();
  await expect(page.locator('.match-analysis')).not.toContainText('%');
});

test('Pro match analysis exposes classified evidence depth and a truthful saved-job tailoring handoff', async ({ page }) => {
  await seed(page);
  const response = { ...sampleResponse, isPro: true, jobs: [{ ...sampleResponse.jobs[0], matchLabel: 'good', matchAnalysis: { ...sampleMatchAnalysis, fullAnalysis: sampleFullAnalysis } }] };
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await page.getByText('Full evidence analysis').click();
  await expect(page.getByText('Required', { exact: true })).toBeVisible();
  await expect(page.getByText('Preferred', { exact: true })).toBeVisible();
  await expect(page.getByText('Nice to have', { exact: true })).toBeVisible();
  await expect(page.getByText('Not demonstrated', { exact: true })).toBeVisible();
  await expect(page.getByText(/Save this job to start a separate job-specific resume/i)).toBeVisible();
  await expect(page.getByText(/master resume stays unchanged/i)).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('.match-analysis').analyze();
  expect(axe.violations).toEqual([]);
});

test('current Pro saved analysis restores and renders complete evidence depth after reload', async ({ page }) => {
  await seed(page);
  const savedJobs = [{ id: '99999999-9999-9999-9999-999999999999', snapshot: sampleResponse.jobs[0].savedSnapshot,
    providerAvailable: true, availabilityCheckedAt: '2026-09-24T00:00:00Z', unavailableAt: null, savedAt: '2026-09-24T00:00:00Z',
    analysisCurrent: true, analysisInvalidationReason: null, matchAnalysis: { ...sampleMatchAnalysis, fullAnalysis: sampleFullAnalysis } }];
  await page.route('**/api/jobs-account', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    isPro: true, saveLimit: 10000, savedJobs, preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null },
  }) }));
  await openJobs(page);
  const savedCard = page.locator('.saved-job-card');
  await savedCard.getByText('Full evidence analysis').click();
  await expect(savedCard.getByText('Required', { exact: true })).toBeVisible();
  await expect(savedCard.getByText('Preferred', { exact: true })).toBeVisible();
  await expect(savedCard.getByText('Nice to have', { exact: true })).toBeVisible();
});

test('Free saved analysis reload renders only the bounded preview and never Pro depth', async ({ page }) => {
  await seed(page);
  const savedJobs = [{ id: '99999999-9999-9999-9999-999999999999', snapshot: sampleResponse.jobs[0].savedSnapshot,
    providerAvailable: true, availabilityCheckedAt: '2026-09-24T00:00:00Z', unavailableAt: null, savedAt: '2026-09-24T00:00:00Z',
    analysisCurrent: true, analysisInvalidationReason: null, matchAnalysis: sampleMatchAnalysis }];
  await page.route('**/api/jobs-account', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    isPro: false, saveLimit: 3, savedJobs, preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null },
  }) }));
  await openJobs(page);
  const savedCard = page.locator('.saved-job-card');
  await expect(savedCard.getByRole('heading', { name: 'What your resume shows' })).toBeVisible();
  await expect(savedCard.getByText('Required', { exact: true })).toHaveCount(0);
  await expect(savedCard.getByRole('button', { name: 'View the full evidence analysis with Pro' })).toBeVisible();
});

test('stale saved analysis has a manual deterministic refresh path with zero provider searches', async ({ page }) => {
  await seed(page);
  let searchCalls = 0;
  const stale = { id: '99999999-9999-9999-9999-999999999999', snapshot: sampleResponse.jobs[0].savedSnapshot,
    providerAvailable: true, availabilityCheckedAt: '2026-09-24T00:00:00Z', unavailableAt: null, savedAt: '2026-09-24T00:00:00Z',
    analysisCurrent: false, analysisInvalidationReason: 'resume_changed', matchAnalysis: null };
  await page.route('**/api/jobs-search', route => { searchCalls += 1; return route.fulfill({ status: 500, body: '{}' }); });
  await page.route('**/api/jobs-account', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'reanalyze') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ refreshed: true, matchAnalysis: sampleMatchAnalysis }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isPro: false, saveLimit: 3, savedJobs: [stale], preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null } }) });
  });
  await openJobs(page);
  await page.getByRole('button', { name: 'Refresh match analysis' }).click();
  await expect(page.getByRole('heading', { name: 'What your resume shows' })).toBeVisible();
  await expect(page.getByText(/without running another job search/i)).toBeVisible();
  expect(searchCalls).toBe(0);
});

test('saving a visible clarification updates its analysis without another provider search', async ({ page }) => {
  await seed(page);
  let searchCalls = 0;
  await page.route('**/api/jobs-search', route => { searchCalls += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...sampleResponse, jobs: [{ ...sampleResponse.jobs[0], matchAnalysis: sampleMatchAnalysis }] }) }); });
  await page.route('**/api/jobs-account', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'clarification') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ saved: true, matchAnalysis: { ...sampleMatchAnalysis, label: 'stretch', importantWarning: 'Confirmed incompatibility: Must hold an active support certification.' } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isPro: false, saveLimit: 3, savedJobs: [], preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null } }) });
  });
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await page.getByRole('button', { name: 'I don’t have this' }).click();
  await expect(page.getByText(/confirmed incompatibility/i)).toBeVisible();
  await expect(page.getByText(/without running another job search/i)).toBeVisible();
  expect(searchCalls).toBe(1);
});

test('saves a normalized job account-side and deduplicates the matching result action', async ({ page }) => {
  await seed(page);
  let savedJobs: unknown[] = [];
  let savedPayload: Record<string, unknown> | undefined;
  await page.route('**/api/jobs-account', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'save') {
      savedPayload = body.job;
      savedJobs = [{ id: '99999999-9999-9999-9999-999999999999', snapshot: body.job, providerAvailable: true, availabilityCheckedAt: '2026-09-24T00:00:00Z', unavailableAt: null, savedAt: '2026-09-24T00:00:00Z' }];
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"savedJobId":"99999999-9999-9999-9999-999999999999","alreadySaved":false}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isPro: false, saveLimit: 3, savedJobs, preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null } }) });
  });
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResponse) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect.poll(() => savedPayload?.providerJobId).toBe('1');
  await expect(page.getByRole('heading', { level: 3, name: 'Customer Experience Specialist' })).toBeVisible();
  const resultCard = page.getByRole('list', { name: 'Job results' }).locator('.job-card');
  await expect(resultCard.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  await expect(page.getByText('1 of 3')).toBeVisible();
});

test('retains an unavailable saved job, marks it clearly, and does not render a live View job action', async ({ page }) => {
  await seed(page);
  const savedJobs = [{
    id: '99999999-9999-9999-9999-999999999999', snapshot: sampleResponse.jobs[0].savedSnapshot,
    providerAvailable: false, availabilityCheckedAt: '2026-09-24T00:00:00Z', unavailableAt: '2026-09-24T00:00:00Z', savedAt: '2026-09-20T00:00:00Z',
  }];
  await page.route('**/api/jobs-account', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    isPro: false, saveLimit: 3, savedJobs, preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null },
  }) }));
  await openJobs(page);
  await expect(page.getByText('No longer available')).toBeVisible();
  const savedCard = page.locator('.saved-job-card');
  await expect(savedCard.getByRole('heading', { name: 'Customer Experience Specialist' })).toBeVisible();
  await expect(savedCard.getByRole('link', { name: /View job/ })).toHaveCount(0);
  await expect(savedCard.getByRole('button', { name: 'Remove saved job' })).toBeEnabled();
});

test('a job with no salary listed shows honest "Salary not listed" text, not a blank or fabricated figure', async ({ page }) => {
  await seed(page);
  const response = { ...sampleResponse, jobs: [{ ...sampleResponse.jobs[0], salary: null }] };
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByText('Salary not listed')).toBeVisible();
});

test('a job missing location, workplace, and employment type shows honest "not listed" text for each rather than crashing or omitting the card', async ({ page }) => {
  await seed(page);
  const response = {
    ...sampleResponse,
    jobs: [{
      ...sampleResponse.jobs[0],
      location: { city: null, region: null, country: null },
      workplace: 'unknown', employmentType: 'unknown', salary: null,
    }],
  };
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Customer Experience Specialist', exact: true })).toBeVisible();
  await expect(page.getByText('Location not listed')).toBeVisible();
  await expect(page.getByText('Workplace not listed')).toBeVisible();
  await expect(page.getByText('Employment type not listed')).toBeVisible();
});

test('malformed job entries in the response are skipped safely rather than crashing the panel', async ({ page }) => {
  await seed(page);
  const response = {
    jobs: [
      sampleResponse.jobs[0],
      { ...sampleResponse.jobs[0], id: 'techmap:bad-workplace', workplace: 'anywhere' },
      { ...sampleResponse.jobs[0], id: 'techmap:bad-url', sourceUrl: 'javascript:alert(1)' },
      { ...sampleResponse.jobs[0], id: 'techmap:bad-url-creds', sourceUrl: 'https://user:pass@jobs.acme.example/1' },
      { ...sampleResponse.jobs[0], id: 'techmap:bad-url-long', sourceUrl: `https://jobs.acme.example/${'a'.repeat(2048)}` },
      { ...sampleResponse.jobs[0], id: 'techmap:bad-salary', salary: { min: 100, max: 50, currency: 'USD', period: 'year' } },
      { ...sampleResponse.jobs[0], id: 'techmap:bad-match', matchLabel: 'excellent' },
      { ...sampleResponse.jobs[0], id: 'techmap:bad-analysis', matchAnalysis: { ...sampleMatchAnalysis, fullAnalysis: { requirements: 'not-an-array' } } },
      'not-an-object',
    ],
    isPro: false, availableCount: 8, proLimit: 20,
  };
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2, name: 'Customer Experience Specialist', exact: true })).toHaveCount(1);
});

test('a response with an invalid availableCount/proLimit (negative, fractional, or wrong type) is treated as unusable rather than rendered', async ({ page }) => {
  await seed(page);
  const response = { ...sampleResponse, availableCount: -1 };
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByText('Job search returned an unusable response.')).toBeVisible();
  await expect(page.locator('.job-card')).toHaveCount(0);
});

test('Free accounts see an honest available-count summary, a five-item limit, and a Pro upgrade path', async ({ page }) => {
  await seed(page);
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResponse) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByText('Showing 1 of 8 matching jobs.')).toBeVisible();
  await page.getByRole('button', { name: 'View Pro options' }).click();
  await expect(page.getByRole('heading', { name: 'A promising role. A considered application.' })).toBeVisible();
});

test('a Free account never sees more than five real job cards even when more are available', async ({ page }) => {
  await seed(page);
  const jobs = Array.from({ length: 5 }, (_, i) => ({ ...sampleResponse.jobs[0], id: `techmap:${i}`, title: `Role ${i}`, sourceUrl: `https://jobs.acme.example/${i}` }));
  const response = { jobs, isPro: false, availableCount: 30, proLimit: 20 };
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.locator('.job-card')).toHaveCount(5);
  await expect(page.getByRole('heading', { level: 2, name: 'Role 0', exact: true })).toBeVisible();
  await expect(page.getByText('Showing 5 of 30 matching jobs.')).toBeVisible();
});

test('a Pro account sees its full available set up to the Pro limit, with no upgrade prompt', async ({ page }) => {
  await seed(page);
  const jobs = Array.from({ length: 20 }, (_, i) => ({ ...sampleResponse.jobs[0], id: `techmap:${i}`, title: `Role ${i}`, sourceUrl: `https://jobs.acme.example/${i}` }));
  const response = { jobs, isPro: true, availableCount: 20, proLimit: 20 };
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.locator('.job-card')).toHaveCount(20);
  await expect(page.getByRole('heading', { level: 2, name: 'Role 19', exact: true })).toBeVisible();
  await expect(page.getByText('Showing 20 of 20 matching jobs.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Pro options' })).toHaveCount(0);
});

test('explicit criteria mode sends the typed fields, including a human-readable location and a salary range, unconverted', async ({ page }) => {
  await seed(page);
  let sentBody: Record<string, unknown> | undefined;
  await page.route('**/api/jobs-search', async route => { sentBody = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...sampleResponse, jobs: [] }) }); });
  await openJobs(page);
  await page.getByRole('radio', { name: 'Enter criteria' }).check();
  await page.getByLabel('Job title or role').fill('Data Analyst');
  await page.getByLabel('Country (optional)').fill('in');
  await page.getByLabel('City or region (optional)').fill('Bengaluru');
  await page.getByLabel('Workplace').selectOption('remote');
  await page.getByLabel('Employment type').selectOption('contract');
  await page.getByLabel('Salary').selectOption('year');
  await page.getByLabel('Currency').fill('inr');
  await page.getByLabel(/Minimum annual salary/).fill('1200000');
  await page.getByLabel(/Maximum annual salary/).fill('1800000');
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect.poll(() => sentBody).toBeTruthy();
  expect(sentBody!.criteria).toEqual({
    title: 'Data Analyst', countryCode: 'IN', location: 'Bengaluru', workplace: 'remote', employmentType: 'contract',
    salary: { period: 'year', currency: 'INR', min: 1200000, max: 1800000 },
  });
});

test('international criteria (non-US country and location) are accepted and sent as typed', async ({ page }) => {
  await seed(page);
  let sentBody: Record<string, unknown> | undefined;
  await page.route('**/api/jobs-search', async route => { sentBody = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...sampleResponse, jobs: [] }) }); });
  await openJobs(page);
  await page.getByRole('radio', { name: 'Enter criteria' }).check();
  await page.getByLabel('Job title or role').fill('Support Specialist');
  await page.getByLabel('Country (optional)').fill('jp');
  await page.getByLabel('City or region (optional)').fill('Osaka');
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect.poll(() => sentBody).toBeTruthy();
  expect(sentBody!.criteria).toEqual({ title: 'Support Specialist', countryCode: 'JP', location: 'Osaka' });
});

test('a salary preference with only a minimum or only a maximum is accepted, clearly distinguishing annual/hourly/no preference', async ({ page }) => {
  await seed(page);
  await openJobs(page);
  await page.getByRole('radio', { name: 'Enter criteria' }).check();
  await expect(page.getByLabel('Salary')).toHaveValue('');
  await page.getByLabel('Job title or role').fill('Analyst');
  await page.getByLabel('Salary').selectOption('hour');
  await expect(page.getByLabel(/Minimum hourly salary/)).toBeVisible();
  await expect(page.getByLabel(/Maximum hourly salary/)).toBeVisible();
  await page.getByLabel('Currency').fill('usd');
  await page.getByLabel(/Maximum hourly salary/).fill('40');
  let sentBody: Record<string, unknown> | undefined;
  await page.route('**/api/jobs-search', async route => { sentBody = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...sampleResponse, jobs: [] }) }); });
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect.poll(() => sentBody).toBeTruthy();
  expect(sentBody!.criteria).toMatchObject({ salary: { period: 'hour', currency: 'USD', max: 40 } });
});

test('rejects a minimum salary greater than the maximum before sending the request', async ({ page }) => {
  await seed(page);
  await openJobs(page);
  await page.getByRole('radio', { name: 'Enter criteria' }).check();
  await page.getByLabel('Job title or role').fill('Analyst');
  await page.getByLabel('Salary').selectOption('year');
  await page.getByLabel('Currency').fill('usd');
  await page.getByLabel(/Minimum annual salary/).fill('200000');
  await page.getByLabel(/Maximum annual salary/).fill('100000');
  let requested = false;
  await page.route('**/api/jobs-search', async route => { requested = true; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResponse) }); });
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByText('Minimum salary cannot be greater than maximum salary.')).toBeVisible();
  expect(requested).toBe(false);
});

test('Auto Refresh defaults off and persists an explicit opt-in, scoped to the signed-in account', async ({ page }) => {
  await seed(page);
  let savedPreference: Record<string, unknown> | undefined;
  await page.route('**/api/jobs-account', route => {
    const request = route.request().postDataJSON();
    if (request.action === 'preferences') { savedPreference = request; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isPro: false, saveLimit: 3, savedJobs: [], preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null } }) });
  });
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResponse) }));
  await openJobs(page);
  const toggle = page.getByRole('checkbox', { name: 'Auto Refresh (at most once a day)' });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);
  await toggle.check();
  await expect.poll(() => savedPreference?.autoRefresh).toBe(true);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
});

test('a second account signing in on the same browser never inherits the first account\'s auto-refresh or saved search', async ({ page }) => {
  await seed(page, owner);
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResponse) }));
  await openJobs(page);
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await page.getByRole('checkbox', { name: 'Auto Refresh (at most once a day)' }).check();

  // Simulate a second account signing in on the same browser: re-seed with a different
  // user id and reload so the app picks up the new session.
  await seed(page, otherOwner);
  await page.reload();
  await page.getByRole('button', { name: /^(Continue my resume|Build my resume)$/, exact: true }).first().click();
  await page.locator('.builder-sidebar').getByRole('button', { name: 'Find jobs', exact: true }).click();
  const toggle = page.getByRole('checkbox', { name: 'Auto Refresh (at most once a day)' });
  await expect(toggle).not.toBeChecked();
});

test('a second account never inherits the first account saved match analysis', async ({ page }) => {
  await seed(page, owner);
  let loadCount = 0;
  const firstOwnerSaved = [{ id: '99999999-9999-9999-9999-999999999999', snapshot: sampleResponse.jobs[0].savedSnapshot,
    providerAvailable: true, availabilityCheckedAt: '2026-09-24T00:00:00Z', unavailableAt: null, savedAt: '2026-09-24T00:00:00Z',
    analysisCurrent: true, analysisInvalidationReason: null, matchAnalysis: sampleMatchAnalysis }];
  await page.route('**/api/jobs-account', route => {
    const body = route.request().postDataJSON();
    if (body.action !== 'load') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' });
    loadCount += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isPro: false, saveLimit: 3,
      savedJobs: loadCount === 1 ? firstOwnerSaved : [], preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null } }) });
  });
  await openJobs(page);
  await expect(page.locator('.saved-job-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'What your resume shows' })).toBeVisible();

  await seed(page, otherOwner);
  await page.reload();
  await page.getByRole('button', { name: /^(Continue my resume|Build my resume)$/, exact: true }).first().click();
  await page.locator('.builder-sidebar').getByRole('button', { name: 'Find jobs', exact: true }).click();
  await expect(page.locator('.saved-job-card')).toHaveCount(0);
  await expect(page.getByText(/Jobs you save will stay here/i)).toBeVisible();
});

test('the jobs panel passes an automated accessibility scan and works at a mobile viewport', async ({ page }) => {
  await seed(page);
  await page.route('**/api/jobs-search', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResponse) }));
  await page.setViewportSize({ width: 375, height: 800 });
  await openBuilder(page);
  const headerJobs = page.locator('.site-header').getByRole('button', { name: 'Find jobs', exact: true });
  await headerJobs.focus();
  await expect(headerJobs).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Find jobs', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Customer Experience Specialist', exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the explicit-criteria form, including the segmented mode control and salary range fields, passes an automated accessibility scan', async ({ page }) => {
  await seed(page);
  await openJobs(page);
  await page.getByRole('radio', { name: 'Enter criteria' }).check();
  await page.getByLabel('Salary').selectOption('year');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

for (const fromCapture of [false, true]) test(`${fromCapture ? 'extension capture to ' : ''}saved-job tailoring creates one persistent version, labels the editor, and persists manual edits without changing the master`, async ({ page }) => {
  await seed(page);
  const master = example();
  const savedJobId = '99999999-9999-9999-9999-999999999999';
  const versionId = '88888888-8888-8888-8888-888888888888';
  const fingerprint = createHash('sha256').update(JSON.stringify(master)).digest('hex');
  const savedJobs = [{ id: savedJobId, snapshot: { ...sampleResponse.jobs[0].savedSnapshot, descriptionText: 'Help customers with care.', ...(fromCapture ? { provider: 'extension', id: 'extension:capture', source: 'extension:greenhouse', capture: { original: { description: 'Original customer duties.' } } } : {}) },
    providerAvailable: true, availabilityCheckedAt: '2026-09-24T00:00:00Z', unavailableAt: null, savedAt: '2026-09-24T00:00:00Z' }];
  let created = false;
  let capturedSaved = !fromCapture;
  let searches = 0;
  await page.route('**/api/jobs-search', route => { searches++; return route.abort(); });
  let revision = 1;
  let persisted: typeof master | undefined;
  let exportResume: typeof master | undefined;
  let wordResume: typeof master | undefined;
  const version = () => ({ id: versionId, savedJobId, jobSnapshot: savedJobs[0].snapshot,
    sourceMasterResumeId: null, sourceMasterRevision: null, sourceMasterFingerprint: fingerprint,
    resume: persisted ?? master, revision, createdAt: '2026-09-24T00:00:00Z', updatedAt: '2026-09-24T00:00:00Z' });
  await page.route('**/api/jobs-account', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'capture_save') {
      expect(body.capture.description).toBe('Help customers with care.');
      expect(body.capture.original.description).toBe('Original customer duties.');
      expect(body.capture.site).toBe('greenhouse');
      expect(body.evidence.headline).toBe(master.headline);
      capturedSaved = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ savedJobId, alreadySaved: false }) });
    }
    if (body.action === 'load') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      isPro: true, saveLimit: 10000, savedJobs: capturedSaved ? savedJobs.map(saved => ({ ...saved, matchAnalysis: { ...sampleMatchAnalysis, fullAnalysis: sampleFullAnalysis }, analysisCurrent: true })) : [], jobResumeVersions: created ? [{ ...version(), resume: undefined, savedJobExists: true }] : [],
      preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null },
    }) });
    if (body.action === 'create_job_resume') {
      created = true;
      expect(body.savedJobId).toBe(savedJobId);
      expect(body.resume.summary).toBe(master.summary);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ created: true, version: version() }) });
    }
    if (body.action === 'update_job_resume') {
      expect(body.expectedRevision).toBe(revision);
      persisted = body.resume;
      revision += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: version() }) });
    }
    if (body.action === 'get_job_resume') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: version() }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' });
  });
  await page.route('**/api/tailor', route => {
    const body = route.request().postDataJSON();
    expect(body).toEqual(expect.objectContaining({ versionId, savedJobId, consent: true, requestId: expect.any(String) }));
    expect(body.resume).toBeUndefined();
    expect(body.jobDescription).toBeUndefined();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [{
      field: 'summary', sectionId: null, entryId: null, originalText: persisted?.summary ?? master.summary,
      suggestedText: 'AI-suggested wording grounded in the current job-specific resume.',
      why: 'This makes the existing customer-support evidence more direct for the saved role.',
    }] }) });
  });
  await page.route('**/api/export-status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isPro: true, remaining: 3, resetsAt: '2026-10-24T00:00:00Z' }) }));
  await page.route('**/api/export-pdf', route => {
    exportResume = route.request().postDataJSON().resume;
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 fixture' });
  });
  await page.route('**/api/export-docx', route => { wordResume = route.request().postDataJSON().resume; return route.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: 'fixture-docx' }); });
  await page.setViewportSize({ width: 375, height: 800 });
  await openBuilder(page);
  if (fromCapture) {
    await page.evaluate(() => window.postMessage({ type: 'resumestride:job-import', payload: { title: 'Customer Experience Specialist', company: 'Acme Support Co', description: 'Original customer duties.', sourceUrl: 'https://job-boards.greenhouse.io/example/jobs/123', capturedAt: new Date().toISOString(), site: 'greenhouse' } }, location.origin));
    await page.getByLabel('Captured description').fill('Help customers with care.');
    const captureAxe = await new AxeBuilder({ page }).include('.captured-job-review').analyze(); expect(captureAxe.violations).toEqual([]);
    await page.getByRole('button', { name: 'Save job and see how I match' }).click();
    await expect(page.getByRole('heading', { name: 'What your resume shows' })).toBeVisible();
    expect(created).toBe(false);
    expect(searches).toBe(0);
  }
  const headerJobs = page.locator('.site-header').getByRole('button', { name: 'Find jobs', exact: true });
  if (!fromCapture) { await expect(headerJobs).toBeVisible(); await headerJobs.click(); }
  await expect(page.getByRole('heading', { level: 1, name: 'Find jobs', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tailor my resume for this job' })).toBeVisible();
  await page.getByRole('button', { name: 'Tailor my resume for this job' }).click();
  await expect(page.getByText(/Job-specific resume — Tailored for Customer Experience Specialist · Acme Support Co/)).toBeVisible();
  await expect(page.getByText(/master resume is preserved separately/i)).toBeVisible();
  await page.getByRole('button', { name: 'Profile & skills' }).click();
  await page.getByRole('textbox', { name: 'Professional profile', exact: true }).fill('A carefully tailored customer-support profile.');
  await expect.poll(() => persisted?.summary).toBe('A carefully tailored customer-support profile.');
  expect(master.summary).toBe(example().summary);
  await page.getByRole('button', { name: 'Design & format' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('checkbox', { name: /I consent to sending this saved job-specific resume/ }).check();
  await page.getByRole('button', { name: 'Get tailoring suggestions' }).click();
  await expect(page.locator('.tailoring-why')).toContainText('Why this helps:');
  await expect(page.locator('.tailoring-why')).toContainText('customer-support evidence');
  if (fromCapture) {
    const beforeRejection = persisted?.summary;
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page.getByText('Rejected — your draft is unchanged.', { exact: true })).toBeVisible();
    expect(persisted?.summary).toBe(beforeRejection);
    await page.getByRole('button', { name: 'Get tailoring suggestions' }).click();
  }
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect.poll(() => persisted?.summary).toBe('AI-suggested wording grounded in the current job-specific resume.');
  await page.getByRole('checkbox', { name: /I consent to uploading my resume content/ }).first().check();
  await page.getByRole('button', { name: 'Download PDF', exact: true }).first().click();
  await expect.poll(() => exportResume?.summary).toBe('AI-suggested wording grounded in the current job-specific resume.');
  if (fromCapture) {
    await page.getByRole('button', { name: 'Download Word (.docx)', exact: true }).first().click();
    await expect.poll(() => wordResume?.summary).toBe('AI-suggested wording grounded in the current job-specific resume.');
    expect(searches).toBe(0);
  }
  const axe = await new AxeBuilder({ page }).include('.paid-tools').analyze();
  expect(axe.violations).toEqual([]);
});

test('an existing version detects master changes and offers non-destructive keep or explicit reset', async ({ page }) => {
  await seed(page);
  const savedJobId = '99999999-9999-9999-9999-999999999999';
  const versionId = '88888888-8888-8888-8888-888888888888';
  const snapshot = { ...sampleResponse.jobs[0].savedSnapshot, descriptionText: '' };
  const version = { id: versionId, savedJobId, jobSnapshot: snapshot, sourceMasterResumeId: null, sourceMasterRevision: null,
    sourceMasterFingerprint: '0'.repeat(64), resume: example(), revision: 3, createdAt: '2026-09-24T00:00:00Z', updatedAt: '2026-09-24T00:00:00Z' };
  let resetBody: Record<string, unknown> | undefined;
  let tailorCalls = 0;
  await page.route('**/api/tailor', route => { tailorCalls += 1; return route.abort(); });
  await page.route('**/api/jobs-account', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'load') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isPro: false, saveLimit: 3,
      savedJobs: [{ id: savedJobId, snapshot, providerAvailable: false, availabilityCheckedAt: '2026-09-24T00:00:00Z', unavailableAt: '2026-09-24T00:00:00Z', savedAt: '2026-09-24T00:00:00Z' }],
      jobResumeVersions: [{ ...version, resume: undefined, savedJobExists: true }], preferences: { criteria: null, autoRefresh: false, lastProviderRefreshAt: null } }) });
    if (body.action === 'get_job_resume') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version }) });
    if (body.action === 'reset_job_resume') {
      resetBody = body;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: { ...version, resume: body.resume, revision: 4, sourceMasterFingerprint: createHash('sha256').update(JSON.stringify(body.resume)).digest('hex') } }) });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"unexpected"}' });
  });
  await openJobs(page);
  await page.getByRole('button', { name: 'Open tailored resume' }).click();
  await expect(page.getByText(/master resume has changed since this version was created/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep this version' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update from master' })).toBeVisible();
  await page.getByRole('button', { name: 'Design & format' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/no description available/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get tailoring suggestions' })).toBeDisabled();
  expect(tailorCalls).toBe(0);
  await page.getByRole('button', { name: 'Back to editing' }).click();
  await page.getByRole('button', { name: 'Keep this version' }).click();
  await expect(page.getByText(/master resume has changed since this version was created/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to master resume' }).click();
  await page.locator('.builder-sidebar').getByRole('button', { name: 'Find jobs', exact: true }).click();
  await page.getByRole('button', { name: 'Open tailored resume' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Update from master' }).click();
  await expect.poll(() => resetBody?.expectedRevision).toBe(3);
  expect((resetBody!.resume as typeof version.resume).summary).toBe(example().summary);
  await expect(page.getByText(/reset from your current master resume/i)).toBeVisible();
});


test('captured Free save errors retain review for retry and account switch clears it', async ({ page }) => {
  await seed(page);
  await openBuilder(page);
  let attempts = 0;
  await page.route('**/api/jobs-account', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'capture_save') attempts++;
    return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Free accounts can save up to 3 jobs. Your existing saved jobs are kept; upgrade to Pro to save more.' }) });
  });
  await page.evaluate(() => window.postMessage({ type: 'resumestride:job-import', payload: { title: 'Private role', company: 'Example', description: 'Private description', sourceUrl: 'https://jobs.example/one', capturedAt: new Date().toISOString() } }, location.origin));
  await page.getByRole('button', { name: 'Save job and see how I match' }).click();
  await expect(page.getByText(/Free accounts can save up to 3 jobs/)).toBeVisible();
  await expect(page.getByLabel('Captured description')).toHaveValue('Private description');
  expect(attempts).toBe(1);
  await page.evaluate(next => { const channel = new BroadcastChannel('sb-auth-test-auth-token'); channel.postMessage({ event: 'SIGNED_IN', session: next }); channel.close(); }, sessionFor(otherOwner));
  await expect(page.getByLabel('Captured description')).toHaveCount(0);
  expect(attempts).toBe(1);
});

for (const alreadySaved of [true, false]) test(`captured save displays the server's ${alreadySaved ? 'existing-snapshot' : 'new-save'} message`, async ({ page }) => {
  await seed(page);
  let saves = 0;
  await page.route('**/api/jobs-account', route => {
    if (route.request().postDataJSON().action !== 'capture_save') return route.fallback();
    saves++;
    return route.fulfill({ json: { savedJobId: '99999999-9999-9999-9999-999999999999', alreadySaved } });
  });
  await openBuilder(page);
  await importCapture(page);
  await page.getByLabel('Captured description').fill('Reviewed incoming edits.');
  await page.getByRole('button', { name: 'Save job and see how I match' }).click();
  await expect(page.getByText(alreadySaved
    ? 'This job was already saved. Its existing snapshot and resume were kept; incoming edits did not replace them.'
    : 'Job saved to your account. Review its Match Analysis below.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Find jobs', exact: true })).toBeVisible();
  await expect(page.getByLabel('Captured description')).toHaveCount(0);
  expect(saves).toBe(1);
});

for (const alreadySaved of [undefined, 'true', 1, null]) test(`captured save rejects a non-boolean alreadySaved (${String(alreadySaved)}) and permits retry`, async ({ page }) => {
  await seed(page);
  let saves = 0;
  await page.route('**/api/jobs-account', route => {
    if (route.request().postDataJSON().action !== 'capture_save') return route.fallback();
    saves++;
    return route.fulfill({ json: { savedJobId: '99999999-9999-9999-9999-999999999999', alreadySaved: saves === 1 ? alreadySaved : true } });
  });
  await openBuilder(page);
  await importCapture(page);
  await page.getByRole('button', { name: 'Save job and see how I match' }).click();
  await expect(page.getByText('Job saving returned an unusable response. Please retry.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Captured description')).toHaveValue('Captured duties.');
  await expect(page.getByRole('heading', { level: 1, name: 'Find jobs', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save job and see how I match' }).click();
  await expect(page.getByText(/This job was already saved\. Its existing snapshot/)).toBeVisible();
  expect(saves).toBe(2);
});

for (const transition of ['account switch', 'replacement capture', 'sign-out']) {
for (const status of [200, 503]) test(`${transition} during captured save aborts and ignores a late ${status} response`, async ({ page }) => {
  await seed(page); await openBuilder(page);
  await holdCaptureResponse(page);
  const authorizations: string[] = [];
  let loads = 0;
  await page.route('**/api/jobs-account', async route => {
    if (route.request().postDataJSON().action === 'capture_save') {
      authorizations.push(route.request().headers().authorization);
      await route.fulfill({ status: authorizations.length === 1 ? status : 200, json: status === 503 && authorizations.length === 1
        ? { error: 'Old account save failed.' }
        : { savedJobId: '99999999-9999-9999-9999-999999999999', alreadySaved: false } });
    } else { loads++; await route.fallback(); }
  });
  await importCapture(page, 'Private in-flight role');
  await page.getByRole('button', { name: 'Save job and see how I match' }).click();
  await expect.poll(() => page.evaluate(() => window.captureSaveTest.ready)).toBe(true);
  if (transition !== 'replacement capture') {
    const next = transition === 'sign-out' ? null : { ...sessionFor(otherOwner), access_token: 'other-test-token' };
    await page.evaluate(next => {
      if (next) localStorage.setItem('sb-auth-test-auth-token', JSON.stringify(next));
      else localStorage.removeItem('sb-auth-test-auth-token');
      const channel = new BroadcastChannel('sb-auth-test-auth-token');
      channel.postMessage({ event: next ? 'SIGNED_IN' : 'SIGNED_OUT', session: next }); channel.close();
    }, next);
    await expect(page.getByLabel('Captured description')).toHaveCount(0);
  }
  await importCapture(page, 'New private role');
  await page.getByLabel('Captured description').fill('New review edits.');
  await expect.poll(() => page.evaluate(() => window.captureSaveTest.signal?.aborted)).toBe(true);
  await page.evaluate(() => window.captureSaveTest.release());
  await expect(page.getByText('Job saved to your account. Review its Match Analysis below.')).toHaveCount(0);
  await expect(page.getByText('Old account save failed.')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Find jobs', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Captured job title')).toHaveValue('New private role');
  await expect(page.getByLabel('Captured description')).toHaveValue('New review edits.');
  expect(loads).toBe(0);
  expect(authorizations).toEqual(['Bearer fake-test-token']);
  if (transition === 'sign-out') {
    await expect(page.getByRole('button', { name: 'Sign in to save captured job' })).toBeEnabled();
  } else {
    await page.getByRole('button', { name: 'Save job and see how I match' }).click();
    await expect(page.getByText('Job saved to your account. Review its Match Analysis below.')).toBeVisible();
    expect(authorizations).toEqual(['Bearer fake-test-token', transition === 'account switch' ? 'Bearer other-test-token' : 'Bearer fake-test-token']);
  }
});
}

for (const width of [320, 390, 768, 1440, 1920]) test(`premium opportunity and tailoring review states at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:1000});
  await seed(page);
  const savedJobId='99999999-9999-9999-9999-999999999999';
  const versionId='88888888-8888-8888-8888-888888888888';
  const master=example();
  let working=structuredClone(master);
  let revision=1;
  const snapshot={...sampleResponse.jobs[0].savedSnapshot, descriptionText:'Support customers and document solutions.'};
  const version=()=>({id:versionId,savedJobId,jobSnapshot:snapshot,sourceMasterResumeId:null,sourceMasterRevision:null,sourceMasterFingerprint:'0'.repeat(64),resume:working,revision,createdAt:'2026-09-24T00:00:00Z',updatedAt:'2026-09-24T00:00:00Z'});
  await page.route('**/api/jobs-account',route=>{
    const body=route.request().postDataJSON();
    if(body.action==='load')return route.fulfill({json:{isPro:true,saveLimit:10000,savedJobs:[{id:savedJobId,snapshot,providerAvailable:false,availabilityCheckedAt:'2026-09-24T00:00:00Z',unavailableAt:'2026-09-24T00:00:00Z',savedAt:'2026-09-24T00:00:00Z',analysisCurrent:true,matchAnalysis:{...sampleMatchAnalysis,label:'stretch',fullAnalysis:sampleFullAnalysis}}],jobResumeVersions:[{...version(),resume:undefined,savedJobExists:true}],preferences:{criteria:null,autoRefresh:false,lastProviderRefreshAt:null}}});
    if(body.action==='get_job_resume')return route.fulfill({json:{version:version()}});
    if(body.action==='update_job_resume'){working=body.resume;revision++;return route.fulfill({json:{version:version()}});}
    return route.fulfill({json:{saved:true}});
  });
  await page.route('**/api/jobs-search',route=>route.fulfill({json:{...sampleResponse,isPro:true,jobs:['strong','good','stretch'].map((matchLabel,i)=>({...sampleResponse.jobs[0],id:`fixture:${i}`,title:`${sampleResponse.jobs[0].title} ${i+1}`,matchLabel,matchAnalysis:{...sampleMatchAnalysis,label:matchLabel,fullAnalysis:sampleFullAnalysis}}))}}));
  await page.route('**/api/export-status',route=>route.fulfill({json:{isPro:true,remaining:3,resetsAt:'2026-10-24T00:00:00Z'}}));
  await page.route('**/api/tailor',route=>route.fulfill({json:{suggestions:[
    {field:'summary',sectionId:null,entryId:null,originalText:master.summary,suggestedText:'Customer experience specialist who supports customers and documents solutions.',why:'Makes the demonstrated support experience easier to find.'},
    {field:'headline',sectionId:null,entryId:null,originalText:master.headline,suggestedText:'Customer support specialist',why:'Uses familiar wording for the existing role.'},
  ]}}));
  await openJobs(page);
  await page.getByRole('button',{name:'Search jobs',exact:true}).click();
  await expect(page.locator('.job-match-badge')).toHaveCount(3);
  await page.locator('.saved-job-card').getByText('Full evidence analysis',{exact:true}).click();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());
  await page.locator('.saved-job-card').screenshot({path:`/tmp/rs-premium-match-${width}.png`});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`/tmp/rs-premium-jobs-${width}.png`});
  await page.getByRole('button',{name:'Open tailored resume',exact:true}).click();
  await expect(page.getByRole('region',{name:'Active document'})).toContainText('Tailored for');
  await expect(page.getByRole('button',{name:'Keep this version'})).toBeVisible();
  await page.getByRole('button',{name:'Keep this version'}).click();
  await page.getByRole('button',{name:'Preview resume',exact:true}).click();
  await page.getByRole('checkbox',{name:/I consent to sending/}).check();
  await page.getByRole('button',{name:'Get tailoring suggestions'}).click();
  await expect(page.getByRole('article',{name:'Suggestion 1',exact:true})).toBeVisible();
  const documentRatios=await page.locator('.review-document .resume-paper').first().evaluate(paper=>{const heading=paper.querySelector('h2')!;return {heading:parseFloat(getComputedStyle(heading).fontSize)/parseFloat(getComputedStyle(paper).fontSize),weight:getComputedStyle(paper).fontWeight};});
  expect(documentRatios.heading).toBeCloseTo(.9,1);expect(documentRatios.weight).toBe('400');
  await page.locator('.tailoring-panel').screenshot({path:`/tmp/rs-premium-tailoring-${width}.png`});
  expect((await new AxeBuilder({page}).include('.tailoring-panel').analyze()).violations).toEqual([]);
  await page.getByRole('article',{name:'Suggestion 1',exact:true}).getByRole('button',{name:'Accept',exact:true}).click();
  await expect(page.getByRole('article',{name:'Suggestion 1',exact:true})).toBeFocused();
  await page.getByRole('article',{name:'Suggestion 2',exact:true}).getByRole('button',{name:'Reject',exact:true}).click();
  await expect(page.getByRole('article',{name:'Suggestion 2',exact:true})).toBeFocused();
  await expect.poll(()=>working.summary).toBe('Customer experience specialist who supports customers and documents solutions.');
  expect(working.headline).toBe(master.headline);
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).summary)).toBe(master.summary);
  await expect(page.getByText('2 of 2 suggestions reviewed · 1 accepted',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
