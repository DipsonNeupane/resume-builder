# AI usage accounting

ResumeStride records one private ledger row for each authorized provider attempt. The browser cannot read or mutate this ledger or call its service-only lifecycle functions.

## Lifecycle

1. `begin_ai_request` atomically deduplicates the logical request and reserves its worst-case cost.
2. `start_ai_request` records that the provider call is about to begin. Failure here prevents the provider call.
3. `finish_ai_request` records the outcome, provider/request identifiers, returned model, tokens, and calculated cost when known.

Statuses are `reserved`, `in_progress`, `succeeded`, `failed`, `invalid`, `timed_out`, and `uncertain`. `feature` and `model` support separate analysis by operation and requested model; `provider_model` preserves the exact model reported by a completed provider response.

Known usage is charged to the monthly budget even when the application rejects the response as invalid, because provider work still occurred. A timeout, transport failure, non-success response without usage, or malformed response without usage retains the entire reservation. Age alone never releases it.

`reconcile_ai_request` can release or settle one of those stranded reservations only from the service role, only with an explicit `confirmed_charged` or `confirmed_not_charged` disposition, and only with a non-empty external evidence reference. The original outcome status remains intact for reliability reporting.

## Idempotency

The UI supplies a UUID for a logical request and reuses it when the browser receives no server response. The server also hashes the exact provider request body and, under a transaction advisory lock, rejects the same account/feature/model/fingerprint within ten minutes. This covers cross-tab and multi-instance races without storing resume or job-description text in the ledger. The window prevents accidental duplicate spend while allowing a deliberate identical request later.

## Analysis fields

The private ledger contains enough data to calculate request count, terminal outcome rates, token totals, actual spend, average/percentile cost, account usage, and cost per Pro customer. Historical rows that predate this migration use `model = 'legacy-unknown'`; their old charged amount is retained, while unavailable token counts remain null rather than being invented.

`charged_micro_usd` is the amount settled against the infrastructure budget. `actual_cost_micro_usd` is the calculated provider cost. They normally match; an anomalous provider report above the reservation is retained in `actual_cost_micro_usd` for investigation while the reservation stays locked and the request is marked invalid.
