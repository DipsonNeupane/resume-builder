import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkScenarios, measureScenario } from '../../scripts/benchmark-tailoring-costs.ts';
import { buildTailoringRequestBody } from '../../server/ai/tailoring.ts';
import { MAX_INPUT_BYTES, reserveCost } from '../../server/ai/cost.ts';

test('tailoring benchmark uses four bounded synthetic scenarios and the production request builder', () => {
  const scenarios = benchmarkScenarios();
  assert.deepEqual(scenarios.map(item => item.name), ['light', 'typical', 'heavy', 'near-maximum']);
  for (const scenario of scenarios) {
    const serialized = JSON.stringify(buildTailoringRequestBody(scenario.resume, scenario.jobDescription));
    const bytes = new TextEncoder().encode(serialized).byteLength;
    assert.ok(bytes <= MAX_INPUT_BYTES, `${scenario.name} exceeds MAX_INPUT_BYTES`);
    const measurement = measureScenario(scenario);
    assert.equal(measurement.serializedBytes, bytes);
    assert.equal(measurement.reservationMicroUsd, reserveCost(serialized));
    assert.ok(measurement.totalCostMicroUsd > 0);
    assert.ok(measurement.reservationMicroUsd >= measurement.totalCostMicroUsd);
  }
  const nearMaximum = measureScenario(scenarios[3]);
  assert.ok(nearMaximum.serializedBytes >= MAX_INPUT_BYTES - 128);
});

test('benchmark payload contains only synthetic tailoring fields and no contact PII', () => {
  const scenario = benchmarkScenarios()[1];
  const serialized = JSON.stringify(buildTailoringRequestBody(scenario.resume, scenario.jobDescription));
  assert.doesNotMatch(serialized, /@|OPENAI_API_KEY|SUPABASE|phone|email|website/i);
  assert.match(serialized, /Synthetic Organization/);
});
