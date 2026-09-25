# ResumeStride tailoring economics benchmark

Measured locally on September 24, 2026. This is a development analysis, not a customer allowance or pricing decision.

## Method

- Uses the production `buildTailoringRequestBody()` path from `server/ai/tailoring.ts`.
- Uses the production `costMicroUsd()` and `reserveCost()` functions from `server/ai/cost.ts`.
- Uses four synthetic English resumes/job descriptions; no customer data or production database access.
- Default execution is offline. No OpenAI or Supabase credentials are read unless an explicit provider mode is requested.
- Offline input tokens are estimated as `ceil(serialized UTF-8 bytes / 4)`.
- Offline output tokens are planning assumptions (light 350, typical 700, heavy 1,200, near-maximum 1,800), not measurements.
- Official GPT-4.1 mini pricing checked September 24, 2026: $0.40/1M input tokens and $1.60/1M output tokens: https://developers.openai.com/api/docs/models/gpt-4.1-mini
- OpenAI's exact input-token endpoint can be used later with `--count-input`: https://developers.openai.com/api/docs/guides/token-counting

Run the safe offline benchmark:

```bash
npm run benchmark:tailoring
```

Optional exact input counts make four non-generation API requests and require `OPENAI_API_KEY`:

```bash
npm run benchmark:tailoring -- --count-input
```

An optional live run is limited to one explicitly named synthetic scenario and requires both `OPENAI_API_KEY` and a deliberate acknowledgement:

```bash
RESUMESTRIDE_BENCHMARK_ALLOW_PAID=I_UNDERSTAND_THIS_MAKES_ONE_PAID_CALL \
  npm run benchmark:tailoring -- --live typical
```

The live path calls the existing `generateTailoringSuggestions()` implementation with a development-only in-memory reservation and records the provider's returned usage. It does not alter production consent, Pro entitlement or budget behavior.

## Offline results

Provider calls made: **0**.

| Scenario | Serialized bytes | Estimated input tokens | Assumed output tokens | Input cost | Output cost | Estimated total | Existing reservation | Reserve / estimate | Per-request % of $19.99 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Light | 5,622 | 1,406 | 350 | $0.000563 | $0.000560 | $0.001123 | $0.008688 | 7.7× | 0.0056% |
| Typical | 13,036 | 3,259 | 700 | $0.001304 | $0.001120 | $0.002424 | $0.011653 | 4.8× | 0.0121% |
| Heavy | 30,222 | 7,556 | 1,200 | $0.003023 | $0.001920 | $0.004943 | $0.018528 | 3.7× | 0.0247% |
| Near maximum | 39,936 | 9,984 | 1,800 | $0.003994 | $0.002880 | $0.006874 | $0.022413 | 3.3× | 0.0344% |

The existing reservation assumes every UTF-8 byte could be one input token, adds 4,096 input-token headroom, and reserves all 3,000 output tokens. It is deliberately much larger than these English planning estimates.

## Per-customer 30-day model

| Operations | Typical estimated cost (% of pass) | Heavy estimated cost (% of pass) | Near-maximum reservation exposure (% of pass) |
|---:|---:|---:|---:|
| 25 | $0.060600 (0.303%) | $0.123575 (0.618%) | $0.560325 (2.803%) |
| 50 | $0.121200 (0.606%) | $0.247150 (1.236%) | $1.120650 (5.606%) |
| 100 | $0.242400 (1.213%) | $0.494300 (2.473%) | $2.241300 (11.212%) |
| 250 | $0.606000 (3.032%) | $1.235750 (6.182%) | $5.603250 (28.030%) |
| 500 | $1.212000 (6.063%) | $2.471500 (12.364%) | $11.206500 (56.061%) |
| 1,000 | $2.424000 (12.126%) | $4.943000 (24.727%) | $22.413000 (112.121%) |

## Interpretation and limitations

Output tokens cost four times as much as input tokens. The number of suggestions, the amount of original text echoed into structured output, and rewrite length can therefore matter as much as resume/job input size. The fixed prompt/schema is a larger proportion of light requests; long resumes and job descriptions dominate heavy input cost.

These totals are directional, not a final allowance basis. Exact request framing is not fully represented by bytes/4, multilingual tokenization can differ materially, and output-token assumptions are not provider measurements. The worst-case reservation column is infrastructure exposure, not expected provider spend.

Before selecting a customer allowance, collect exact provider usage for a small consented/synthetic benchmark set spanning English and non-English resumes, short/typical/long careers, several occupations, short and long postings, zero/few/eight suggestion outputs, and provider failures. Record only privacy-safe aggregate data: input/output tokens, serialized bytes, suggestion count, validation outcome, latency, reservation, actual cost, retry status and user acceptance/rejection rate. Use p50/p90/p95/p99 rather than only averages.

## Accounting observations

1. Pricing and the pinned model are consistent with current official OpenAI pricing, but the rates are hardcoded. A future model or price change must update and verify both together.
2. Each `/api/tailor` attempt generates a new random reservation ID. There is no client-supplied idempotency key, so cross-tab or network retries can create duplicate provider calls and charges even though the UI blocks a same-tab double click.
3. Timeouts, non-OK responses and invalid provider output intentionally remain fully reserved forever. This fails safely for the $25 cap but can strand budget and makes `spent_micro_usd` lower than actual provider charges for billable failed/invalid responses.
4. The ledger stores reserved and charged micro-dollars, but not model, input tokens or output tokens. It cannot by itself provide the real usage distribution needed for a fair-use decision.
5. The byte-based reservation is safely conservative but 3.3–7.7× the current English planning estimates, so reservation exposure should not be mistaken for expected customer cost.
6. The schema permits up to eight suggestions and 1,000 characters per suggestion while output is capped at 3,000 tokens. Verbose valid-intent responses can truncate or fail validation, retaining the full reservation.

No production pricing, Pro entitlement, AI limit, billing behavior, budget safeguard, deployment or provider infrastructure was changed.
