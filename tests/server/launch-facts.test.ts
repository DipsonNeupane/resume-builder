import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { launchFacts } from '../../src/content/launchFacts.ts';
import { commercialPlans, commercialPolicy } from '../../src/content/commercial.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const migrations = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
/** The last migration that (re)defines a function is the enforced definition. */
function latestFunction(name: string): string {
  for (const file of [...migrations].reverse()) {
    const sql = read(`supabase/migrations/${file}`);
    const definitions = [...sql.matchAll(new RegExp(`create (?:or replace )?function public\\.${name}\\(`, 'g'))];
    const start = definitions.at(-1)?.index;
    if (start !== undefined) return sql.slice(start, sql.indexOf('end $$', start));
  }
  throw new Error(`No definition of ${name}`);
}

test('download allowance: SQL enforcement matches the shared launch facts', () => {
  const { count, windowDays } = launchFacts.freeDownloads;
  for (const fn of ['document_begin', 'pdf_status']) {
    const sql = latestFunction(fn);
    assert.match(sql, new RegExp(`interval '${windowDays} days'`), `${fn} window`);
    assert.match(sql, new RegExp(`(?:>=\\s*${count}\\b|\\b${count}-v_count)`), `${fn} count`);
  }
});

test('download allowance: legal and public copy agree with the launch facts', () => {
  assert.equal(launchFacts.freeDownloads.count, 7);
  const terms = read('public/terms.html');
  assert.match(terms, /seven \(7\) successful PDF or Word document downloads in any rolling seven-day period/);
  assert.match(terms, /failed download does not count/);
  for (const path of ['public/terms.html', 'README.md', 'src/content/capabilities.ts', 'public/pricing/index.html', 'public/features/resume-exports/index.html']) {
    const text = read(path);
    assert.doesNotMatch(text, /three successful|30-day period|fixed 30-day/i, `${path} has a stale allowance`);
  }
  assert.match(commercialPolicy.freeDownloads, /7 successful PDF or Word downloads in a rolling 7-day window/);
  const free = commercialPlans.find(plan => plan.id === 'free');
  assert.ok(free?.includes.includes('7 successful PDF or Word downloads per rolling 7 days'));
  assert.equal(commercialPlans.find(plan => plan.id === 'pro')?.price, 'US$14.99');
});

test('application, trial and Pro limits: enforcement, terms and pricing agree with the launch facts', async () => {
  const tracker = read('supabase/migrations/20261027120000_application_tracker.sql');
  assert.match(tracker, new RegExp(`free_application_limit integer not null default ${launchFacts.freeApplications}\\b`));
  assert.match(tracker, new RegExp(`if v_is_pro then return ${launchFacts.proApplicationCeiling}; end if;`));
  assert.match(read('supabase/migrations/20261027140000_free_tailoring_trial.sql'), new RegExp(`free_trial_ai_runs integer not null default ${launchFacts.freeTrialAiRuns}\\b`));
  // The hourly allowance counts running and successful requests only; failures never use it.
  assert.match(latestFunction('reserve_ai_budget'), new RegExp(`interval '1 hour'\\s+and status in \\('reserved','in_progress','succeeded'\\)\\) >= ${launchFacts.aiRequestsPerHour}\\b`));
  assert.match(read('supabase/migrations/20261028100000_tailoring_provenance_ai_safeguards.sql'), /ai_monthly_budget_micro_usd bigint not null default 25000000\s+check \(ai_monthly_budget_micro_usd between 0 and 25000000\)/);
  const { PRO_JOB_LIMIT } = await import('../../server/jobs/handler.ts');
  assert.equal(PRO_JOB_LIMIT, launchFacts.proResultsPerSearch);
  const terms = read('public/terms.html');
  for (const phrase of [/up to one hundred \(100\) applications/, /one \(1\) complete tailoring trial/, /up to three \(3\) successful AI suggestion runs/,
    /up to 10,000 tracked applications/, /up to twenty \(20\) results per job search/, /up to twenty \(20\) AI tailoring requests per hour/, /US\$14\.99 per month/]) assert.match(terms, phrase)
  // Renewal-reminder delivery is not verified live, so launch-facing copy does not promise it.
  for (const path of ['public/terms.html', 'public/privacy.html', 'public/pricing/index.html']) assert.doesNotMatch(read(path), /renewal reminder|reminder (three|3) days|before (it |each )?renew(s|al)/i, path)
  // No retired products in launch-facing terms or pricing.
  for (const path of ['public/terms.html', 'public/pricing/index.html']) assert.doesNotMatch(read(path), /one-time Pro pass|Individual Premium-template subscription|individual template subscription/i, path)
  const pricing = read('public/pricing/index.html');
  for (const text of [commercialPolicy.proLimits, commercialPolicy.freeTrial, commercialPolicy.dataAccess]) assert.ok(pricing.includes(text.replaceAll('&', '&amp;')), text)
});

test('search and trial-count limits: enforcement, terms and pricing agree with the launch facts', async () => {
  const { count, windowHours } = launchFacts.freeManualRefreshes;
  const refresh = latestFunction('jobs_reserve_recommendation_refresh');
  assert.match(refresh, new RegExp(`v_count>=${count}\\b`));
  assert.match(refresh, new RegExp(`interval '${windowHours} hours'`));
  const { FREE_JOB_LIMIT } = await import('../../server/jobs/handler.ts');
  assert.equal(FREE_JOB_LIMIT, launchFacts.freeResultsPerRefresh);
  assert.match(read('supabase/migrations/20261027120000_application_tracker.sql'), new RegExp(`free_tailoring_trials integer not null default ${launchFacts.freeTailoringTrials}\\b`));
  assert.match(read('public/terms.html'), /three \(3\) manual job-search refreshes in any rolling twenty-four-hour period, with up to ten \(10\) relevant results per refresh/);
  assert.ok(read('public/pricing/index.html').includes(`Up to ${launchFacts.freeResultsPerRefresh} relevant results per refresh; ${count} manual refreshes per rolling ${windowHours} hours`));
});
