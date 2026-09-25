/**
 * Development-only economics benchmark for ResumeStride's existing tailoring request.
 *
 * Default mode is deterministic and offline: it uses synthetic data, the production
 * request builder, reserveCost() and costMicroUsd(). It never reads production resumes,
 * touches Supabase, changes entitlements, or calls OpenAI.
 *
 * Optional explicit modes:
 *   npm run benchmark:tailoring -- --count-input
 *     Makes exactly four non-generation calls to OpenAI's input-token count endpoint.
 *   RESUMESTRIDE_BENCHMARK_ALLOW_PAID=I_UNDERSTAND_THIS_MAKES_ONE_PAID_CALL \
 *     npm run benchmark:tailoring -- --live typical
 *     Makes exactly one paid generation call using the named synthetic scenario.
 *
 * Both optional modes require OPENAI_API_KEY. The key is never printed.
 */
import { pathToFileURL } from 'node:url';
import {
  buildTailoringRequestBody,
  generateTailoringSuggestions,
  type TailoringResume,
} from '../server/ai/tailoring.ts';
import {
  AI_MODEL,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_TOKENS,
  costMicroUsd,
  reserveCost,
} from '../server/ai/cost.ts';

const PRO_PASS_USD = 19.99;
const INPUT_USD_PER_MILLION = 0.40;
const OUTPUT_USD_PER_MILLION = 1.60;
const liveAcknowledgement = 'I_UNDERSTAND_THIS_MAKES_ONE_PAID_CALL';
const usageLevels = [25, 50, 100, 250, 500, 1000] as const;

export type BenchmarkScenario = {
  name: 'light' | 'typical' | 'heavy' | 'near-maximum';
  description: string;
  resume: TailoringResume;
  jobDescription: string;
  /** Planning assumption only; a live run replaces this with provider usage. */
  estimatedOutputTokens: number;
};

export type BenchmarkMeasurement = {
  name: BenchmarkScenario['name'];
  description: string;
  serializedBytes: number;
  inputTokens: number;
  inputTokenSource: 'bytes/4 estimate' | 'OpenAI input-token count' | 'OpenAI generation usage';
  outputTokens: number;
  outputTokenSource: 'planning estimate' | 'OpenAI generation usage';
  inputCostMicroUsd: number;
  outputCostMicroUsd: number;
  totalCostMicroUsd: number;
  reservationMicroUsd: number;
  reservationMultiple: number;
};

const words = {
  summary: 'Experienced professional delivering reliable projects, clear communication, and practical improvements across collaborative teams.',
  detail: 'Coordinated priorities, documented decisions, reviewed outcomes, and supported colleagues while maintaining accurate records and dependable service.',
  job: 'The successful candidate will collaborate across teams, communicate clearly, organize competing priorities, document decisions, and deliver reliable results for customers and colleagues.',
};

function repeated(sentence: string, minimumChars: number): string {
  let value = sentence;
  while (value.length < minimumChars) value += ` ${sentence}`;
  return value.slice(0, minimumChars);
}

function entry(section: number, index: number, detailChars: number) {
  return {
    id: `section-${section}-entry-${index}`,
    title: index % 2 ? 'Project Coordinator' : 'Operations Specialist',
    organization: `Synthetic Organization ${section + 1}`,
    location: 'Example City',
    dates: `20${18 + index}–20${19 + index}`,
    description: repeated(words.detail, detailChars),
  };
}

function resume(sectionCount: number, entriesPerSection: number, detailChars: number, summaryChars: number): TailoringResume {
  return {
    headline: 'Operations and project delivery professional',
    summary: repeated(words.summary, summaryChars),
    skills: 'Project coordination, stakeholder communication, process documentation, reporting, customer service, scheduling',
    sections: Array.from({ length: sectionCount }, (_, sectionIndex) => ({
      id: `section-${sectionIndex}`,
      title: sectionIndex === 0 ? 'Professional experience' : `Additional experience ${sectionIndex}`,
      entries: Array.from({ length: entriesPerSection }, (_, entryIndex) => entry(sectionIndex, entryIndex, detailChars)),
    })),
  };
}

function serializedBytes(resumeValue: TailoringResume, jobDescription: string): number {
  return new TextEncoder().encode(JSON.stringify(buildTailoringRequestBody(resumeValue, jobDescription))).byteLength;
}

function nearMaximumScenario(): BenchmarkScenario {
  const resumeValue = resume(5, 5, 430, 900);
  const jobDescription = repeated(words.job, 16_000);
  const target = MAX_INPUT_BYTES - 64;
  let low = 0;
  let high = 50_000;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = { ...resumeValue, summary: `${resumeValue.summary} ${repeated(words.detail, middle)}` };
    if (serializedBytes(candidate, jobDescription) <= target) low = middle;
    else high = middle - 1;
  }
  return {
    name: 'near-maximum',
    description: 'Synthetic long resume and 16,000-character job posting fitted just below MAX_INPUT_BYTES',
    resume: { ...resumeValue, summary: `${resumeValue.summary} ${repeated(words.detail, low)}` },
    jobDescription,
    estimatedOutputTokens: 1_800,
  };
}

export function benchmarkScenarios(): BenchmarkScenario[] {
  return [
    {
      name: 'light',
      description: 'One short role and a normal short job posting',
      resume: resume(1, 1, 260, 240),
      jobDescription: repeated(words.job, 1_800),
      estimatedOutputTokens: 350,
    },
    {
      name: 'typical',
      description: 'Three sections, six entries, and a realistic job posting',
      resume: resume(3, 2, 520, 700),
      jobDescription: repeated(words.job, 4_800),
      estimatedOutputTokens: 700,
    },
    {
      name: 'heavy',
      description: 'Five sections, fifteen entries, and a long job posting',
      resume: resume(5, 3, 850, 1_200),
      jobDescription: repeated(words.job, 10_000),
      estimatedOutputTokens: 1_200,
    },
    nearMaximumScenario(),
  ];
}

function toUsd(microUsd: number): number { return microUsd / 1_000_000; }
function money(microUsd: number): string { return `$${toUsd(microUsd).toFixed(6)}`; }
function percentOfPass(microUsd: number): string { return `${((toUsd(microUsd) / PRO_PASS_USD) * 100).toFixed(3)}%`; }

async function exactInputTokens(apiKey: string, scenario: BenchmarkScenario): Promise<number> {
  const response = await fetch('https://api.openai.com/v1/responses/input_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTailoringRequestBody(scenario.resume, scenario.jobDescription)),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Input-token count failed with HTTP ${response.status}.`);
  const body: unknown = await response.json();
  const count = typeof body === 'object' && body !== null ? (body as { input_tokens?: unknown }).input_tokens : undefined;
  if (!Number.isSafeInteger(count) || (count as number) < 0) throw new Error('Input-token count returned an invalid response.');
  return count as number;
}

type LiveUsage = { inputTokens: number; outputTokens: number; settledMicroUsd: number | null };

async function runOneLiveScenario(apiKey: string, scenario: BenchmarkScenario): Promise<LiveUsage> {
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let settledMicroUsd: number | null = null;
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const clone = response.clone();
    try {
      const body: unknown = await clone.json();
      if (typeof body === 'object' && body !== null) {
        const usage = (body as { usage?: unknown }).usage;
        if (typeof usage === 'object' && usage !== null) {
          const candidateInput = (usage as { input_tokens?: unknown }).input_tokens;
          const candidateOutput = (usage as { output_tokens?: unknown }).output_tokens;
          if (Number.isSafeInteger(candidateInput) && Number.isSafeInteger(candidateOutput)) {
            inputTokens = candidateInput as number;
            outputTokens = candidateOutput as number;
          }
        }
      }
    } catch { /* production validation will report malformed responses */ }
    return response;
  };
  try {
    await generateTailoringSuggestions(
      { apiKey },
      {
        consent: true,
        pro: true,
        reserve: async () => ({
          start: async () => {},
          finish: async outcome => { if (outcome.actualMicroUsd !== undefined) settledMicroUsd = outcome.actualMicroUsd; },
        }),
      },
      scenario.resume,
      scenario.jobDescription,
      recordingFetch,
    );
  } catch (error) {
    if (inputTokens === null || outputTokens === null) throw error;
    // Usage is still economically useful when the provider charged for an output that
    // production validation rejected. The report labels settlement separately.
  }
  if (inputTokens === null || outputTokens === null) throw new Error('The live response did not include valid token usage.');
  return { inputTokens, outputTokens, settledMicroUsd };
}

export function measureScenario(
  scenario: BenchmarkScenario,
  exactInput?: number,
  liveUsage?: LiveUsage,
): BenchmarkMeasurement {
  const serialized = JSON.stringify(buildTailoringRequestBody(scenario.resume, scenario.jobDescription));
  const bytes = new TextEncoder().encode(serialized).byteLength;
  const inputTokens = liveUsage?.inputTokens ?? exactInput ?? Math.ceil(bytes / 4);
  const outputTokens = liveUsage?.outputTokens ?? scenario.estimatedOutputTokens;
  const inputCostMicroUsd = costMicroUsd(inputTokens, 0);
  const outputCostMicroUsd = costMicroUsd(0, outputTokens);
  const totalCostMicroUsd = costMicroUsd(inputTokens, outputTokens);
  const reservationMicroUsd = reserveCost(serialized);
  return {
    name: scenario.name,
    description: scenario.description,
    serializedBytes: bytes,
    inputTokens,
    inputTokenSource: liveUsage ? 'OpenAI generation usage' : exactInput === undefined ? 'bytes/4 estimate' : 'OpenAI input-token count',
    outputTokens,
    outputTokenSource: liveUsage ? 'OpenAI generation usage' : 'planning estimate',
    inputCostMicroUsd,
    outputCostMicroUsd,
    totalCostMicroUsd,
    reservationMicroUsd,
    reservationMultiple: reservationMicroUsd / totalCostMicroUsd,
  };
}

function printReport(measurements: BenchmarkMeasurement[], providerCalls: number): void {
  console.log(`# ResumeStride tailoring economics benchmark\n`);
  console.log(`Model: ${AI_MODEL}`);
  console.log(`Pricing used: $${INPUT_USD_PER_MILLION.toFixed(2)}/1M input, $${OUTPUT_USD_PER_MILLION.toFixed(2)}/1M output`);
  console.log(`Provider calls made: ${providerCalls}\n`);
  console.log('| Scenario | Bytes | Input tokens | Output tokens | Input cost | Output cost | Total | Reservation | Reserve / cost |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const item of measurements) {
    console.log(`| ${item.name} | ${item.serializedBytes.toLocaleString()} | ${item.inputTokens.toLocaleString()} (${item.inputTokenSource}) | ${item.outputTokens.toLocaleString()} (${item.outputTokenSource}) | ${money(item.inputCostMicroUsd)} | ${money(item.outputCostMicroUsd)} | ${money(item.totalCostMicroUsd)} | ${money(item.reservationMicroUsd)} | ${item.reservationMultiple.toFixed(1)}× |`);
  }
  const typical = measurements.find(item => item.name === 'typical')!;
  const heavy = measurements.find(item => item.name === 'heavy')!;
  const worst = measurements.find(item => item.name === 'near-maximum')!;
  console.log('\n| Operations / 30 days | Typical cost (% pass) | Heavy cost (% pass) | Worst reservation exposure (% pass) |');
  console.log('|---:|---:|---:|---:|');
  for (const operations of usageLevels) {
    const typicalCost = typical.totalCostMicroUsd * operations;
    const heavyCost = heavy.totalCostMicroUsd * operations;
    const worstExposure = worst.reservationMicroUsd * operations;
    console.log(`| ${operations} | ${money(typicalCost)} (${percentOfPass(typicalCost)}) | ${money(heavyCost)} (${percentOfPass(heavyCost)}) | ${money(worstExposure)} (${percentOfPass(worstExposure)}) |`);
  }
  console.log(`\nReservation basis: serialized UTF-8 bytes + 4,096 input-token headroom and ${MAX_OUTPUT_TOKENS.toLocaleString()} output tokens.`);
  console.log('Offline token counts use bytes/4 and output planning assumptions; they are estimates, not provider measurements.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const countInput = args.includes('--count-input');
  const liveAt = args.indexOf('--live');
  const liveName = liveAt >= 0 ? args[liveAt + 1] : undefined;
  const scenarios = benchmarkScenarios();
  if (liveAt >= 0 && !scenarios.some(item => item.name === liveName)) {
    throw new Error('--live requires one explicit scenario: light, typical, heavy, or near-maximum.');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if ((countInput || liveName) && !apiKey) throw new Error('OPENAI_API_KEY is required for an explicitly requested provider mode.');
  if (liveName && process.env.RESUMESTRIDE_BENCHMARK_ALLOW_PAID !== liveAcknowledgement) {
    throw new Error(`Set RESUMESTRIDE_BENCHMARK_ALLOW_PAID=${liveAcknowledgement} to authorize exactly one synthetic paid call.`);
  }
  let providerCalls = 0;
  const exactCounts = new Map<BenchmarkScenario['name'], number>();
  if (countInput && apiKey) {
    for (const scenario of scenarios) {
      exactCounts.set(scenario.name, await exactInputTokens(apiKey, scenario));
      providerCalls += 1;
    }
  }
  let liveUsage: LiveUsage | undefined;
  if (liveName && apiKey) {
    liveUsage = await runOneLiveScenario(apiKey, scenarios.find(item => item.name === liveName)!);
    providerCalls += 1;
  }
  const measurements = scenarios.map(scenario => measureScenario(
    scenario,
    exactCounts.get(scenario.name),
    scenario.name === liveName ? liveUsage : undefined,
  ));
  printReport(measurements, providerCalls);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Benchmark failed.');
  process.exitCode = 1;
});
