# Observability and production diagnostics

Task #57 / Task C, September 24, 2026. Local implementation only; no deployment,
monitoring account, log drain, alert, migration or paid vendor was provisioned.

## Audit and coverage

Before this work, server handlers used friendly `HttpError` messages and generic
503s for unexpected exceptions, but had no common logging or correlation boundary.
AI usage/reservations were already durable in SQL. Browser auth/cloud errors and
extension acknowledgments already had recovery UI. Analytics stripped query/hash
values but accepted arbitrary paths and spread future event properties.

| Surface | Implemented diagnostic coverage |
| --- | --- |
| Every `api/*.ts` entrypoint | One completion, fresh request ID, route/feature, elapsed time, HTTP status and stable category; unexpected rejection caught safely |
| Authentication | Timed server verification; missing/rejected session vs unavailable auth; direct browser Supabase auth has local status/timing records |
| Cloud persistence | Local load/create/save outcomes and optimistic conflicts; account-owned job-version API feature and conflict category |
| Billing / entitlement | Request outcomes, database transport, Stripe response status/timing and typed SDK failures (including connection errors without a response) |
| AI tailoring / accounting | Provider transport plus reserve/start/finish operations, invalid/uncertain/timeout outcomes; global budget vs per-account limit vs accounting failure |
| Jobs / provider limits | Provider status/timing/validation failures, cache hit/miss/join, account throttle 429; swallowed optional-page 429 remains visible |
| Match Analysis | Timed deterministic analysis; reanalysis/clarification request feature; preferences/persistence database errors |
| Exports | PDF/DOCX request outcome, render timing/failure, allowance and accounting database errors; reservation cleanup unchanged |
| Extension | App receiver has bounded local rejection/success records; worker console records final delivery outcome/timing, including acknowledgment failures; capture-save API has extension feature |
| Database | All service-client HTTP operations observed, including ignored best-effort RPC failures; HTTP 409 and explicitly recognized optimistic conflicts distinguished |

Database transport status does not distinguish every SQL business exception. A
PostgREST 400 may be a deliberate limit rather than an outage. Correlate it with
the request category and AI stage. No database error text is retained. A provider
transport success means headers arrived; validation/AI outcome events and request
completion determine actual success. Stripe's SDK retains its existing retry
policy. No new retry, throttle, entitlement, budget, pricing or model policy exists.

## Server schema, configuration and correlation

`server/observability.ts` uses Node AsyncLocalStorage, monotonic elapsed time and
JSON lines on stdout. All production API entrypoints wrap their existing handlers
in `runObservedRequest`. Local Vite alone does not execute API routes; use the
documented Vercel development adapter when exercising both frontend and API.

`DIAGNOSTICS_LEVEL=info` (default) records all operations and completions. `warn`
records rejections/failures; `error` records degraded failures (provider 429s are
warnings); `off` disables logging. Filtering does not disable response IDs.
Use `info` when calculating ratios: filtered logs have no reliable denominator.

Schema version 1 has only event, UTC time, server-generated requestId, fixed route,
feature, operation, category, level, health, bounded durationMs, optional HTTP
status, and booleans aiEnabled/exportsEnabled/billingEnabled. The vocabulary is in
`src/services/diagnosticSchema.ts`. Fields are reconstructed rather than spread.
Health is `healthy`, `rejected` (expected denial/conflict/configuration) or
`degraded` (failure observed, even when the final request succeeds with partial
results). These are observed outcomes, **not readiness probes or uptime promises**.
Feature flags describe configuration, not provider health or customer entitlement.
Module-load failures, middleware/host rejection and process termination happen
outside the handler boundary and still require host-level error/availability alerts.

No resume/job/suggestion text, email, owner/document/capture ID, IP, user agent,
URL/query/referrer, SQL/error text/stack/cause, provider response, fingerprint,
authorization header, key, token, password, payment data or provider request ID is
accepted by the logging API. Existing accounting records remain in their existing
protected SQL tables; their identifiers are not copied into logs.

Responses retain existing bodies/status/cache policy and add `X-Request-ID`;
errors add a fixed `X-Error-Category`. IDs are minted for each request, never taken
from browser headers or AI/export idempotency IDs, and never sent to providers.
Support can use the response header plus approximate time and feature to find a
request. Ask customers **only for those fields**, not HAR files, payloads, tokens,
or screenshots containing their documents. Customer UI does not expose stacks.

One request can have multiple records for the same provider operation (transport,
validation, lifecycle). Count `event=request_completed` for request error rates.
For upstream HTTP rates use operation records with a numeric `status`. For failure
alerts deduplicate by requestId and category within the alert window. Shared jobs
cache work belongs to the originating request; a joiner has a cache_join event and
its own completion, not duplicate provider execution.

## Browser and extension limitations

`src/services/diagnostics.ts` holds at most 50 fixed feature/operation/category/
duration records in memory. No console printing, persistent storage, telemetry
endpoint, account identity or cross-session identifier is added. Development
DevTools can inspect them using
`import('/src/services/diagnostics.ts').then(m => m.readBrowserDiagnostics())`;
`clearBrowserDiagnostics()` clears them, as does reload. Production does not serve
that source path. A future reviewed support/monitoring adapter would have to call
the exported reader; no production browser-error dashboard is claimed today.
Browser-only failures cannot currently raise centralized production alerts.

The installed extension worker emits only schema/event/feature/category/duration
for accepted delivery attempts to its own local console. Sender/destination
rejections remain silent; there is no remote extension telemetry. A successful
receipt does not imply account save or entitlement. The user-facing retry and
bounded session-capture retention remain unchanged.

Analytics now accepts only pageviews on known public production URLs with no
query or unknown fragment, drops custom events and arbitrary paths, strips public
anchors, reconstructs the returned event, and disables SDK debug logging. In-app
states sharing `/` cannot expose state/content through that fixed URL. No product
input is passed to analytics. The hosted analytics script/platform may process
its own standard traffic metadata; its deployed network payload, referrer handling,
retention and privacy disclosures still require owner verification. Platform/CDN,
Supabase and Stripe logs are separate from this application schema.

## Recommended alerts (owner configuration, not active)

Use these starting thresholds, then tune to measured private-deployment traffic.
Group only by fixed feature/route/category; requestId is for drill-down, never a
metric label. Exclude deliberate disabled-feature `configuration` failures from
availability alerts, but alert on configuration errors for features intended on.

| Signal | Initial threshold | Response |
| --- | --- | --- |
| API 5xx | >2% and >=5 failures in 5 minutes with >=100 completions; at low traffic, >=3 failures in 10 minutes | Inspect correlated dependency records, configuration and host failures |
| AI budget | Global reserved + spent >=70% warning, >=90% urgent; any ai_budget rejection | Review aggregate budget and uncertain reservations; do not automatically raise the ceiling or release uncertain charges |
| AI accounting | Any ai_accounting failure; repeated ai_uncertain/provider_timeout | Reconcile with existing protected accounting workflow; never retry charged work blindly |
| Provider errors / 429 | >=5 affected requests or >10% over 10 minutes, by provider feature | Check upstream health/quota; preserve existing cache and retry policy; include partial-success jobs requests |
| Database errors | >=3 unexpected database_error requests in 5 minutes | Correlate final categories to distinguish deliberate SQL limits, migration/configuration problems and outages |
| Database conflicts | Sudden increase over the local baseline | Investigate concurrent-write UX; ordinary conflicts are not a paging event |
| Export failures | >=3 export_failure or export 5xx requests in 10 minutes | Inspect renderer/dependency health and accounting; confirm failed renders did not consume allowances |
| Billing / webhook | Any repeated webhook 5xx or provider_failure | Review retry/reconciliation state with restricted billing tooling; never copy payment objects to diagnostics |

Budget warning requires an owner-managed read-only aggregate check of
`public.ai_budget_months`, not application requests or content-bearing log queries.
For the **existing** 25,000,000 micro-USD ceiling, the utilization is
`100 * (reserved_micro_usd + spent_micro_usd) / 25000000` for the current UTC month.
Do not query owner-level rows for this alert. No scheduled job was added and no
early-warning alert is currently running.

## Integration boundary and owner action

The synchronous `DiagnosticSink` is the integration boundary. It receives only a
frozen sanitized record; sink exceptions cannot change a response or accounting.
An optional Sentry/equivalent adapter may aggregate these records, but must not
capture original exceptions, breadcrumbs, HTTP bodies, URLs, cookies, headers,
sessions, DOM, screenshots or replay. Do not enable an SDK's automatic capture
defaults. Any asynchronous adapter must catch its own failures, bound its queue
and flush according to the host lifecycle; the current sink is synchronous stdout.

OWNER ACTION before locked deployment acceptance:

1. Choose native host logs initially, or create an optional monitoring project
   after reviewing cost/data residency. No credentials are present or required by
   this implementation. Define operator access, retention/deletion, and an on-call
   owner. Review host logs separately because they may collect IPs/URLs.
2. Configure the desired log level and alerts. Add an aggregate AI-budget check.
   Verify log retention supports the intended support window; do not invent a
   legal retention guarantee in product copy.
3. On a controlled private deployment with fictional inputs, exercise an auth
   rejection, database conflict/error, provider 429, AI accounting failure and PDF/
   DOCX failure. Confirm response ID -> correlated records, friendly customer
   errors, partial-success health, alert delivery and sink-outage resilience.
4. Inspect actual analytics requests with sentinel tokens/content; verify no
   sensitive data in referrer or other host-generated fields. Finalize the privacy
   disclosure and any future browser monitoring policy before enabling remote
   diagnostics. Keep public access locks in place.

Local tests use mocked providers and no live quota. Browser execution remains a
separate acceptance gate when the current sandbox cannot open localhost ports.
