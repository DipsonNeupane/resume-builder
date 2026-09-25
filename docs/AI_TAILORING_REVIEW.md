# AI tailoring provider service review

**Follow-up hardening pass (independent review):** fixed a numeric-guard bug
where `originalText.includes(number)` accepted "50" as already-present when
the source only contained "150"; the check is now a Unicode (`\p{Nd}`),
token-bounded, multiset comparison. Also added: rejection of blank
suggestion targets, duplicate same-field suggestions, and duplicate
section/entry ids in the resume input; `redirect: 'error'` on the provider
`fetch`; a bounded response-body reader (128 KiB) in place of unbounded
`response.json()`; an actual-cost-must-not-exceed-reservation check before
settling; and a safe `HttpError(400, ...)` for a null/non-object resume
input. See the dated bullets below for detail.

Scope: `server/ai/tailoring.ts` only — a provider-call orchestrator, not a route. It
has no knowledge of HTTP, Supabase, or Stripe; a caller (owned elsewhere) is
responsible for the actual HTTP endpoint, reading `OPENAI_API_KEY`/`AI_ENABLED`
via `tailoringConfig(env)`, verifying the authenticated Pro entitlement, recording
per-request consent, and backing `ReserveFn`/`Reservation.settle` with the AI
budget ledger described in `docs/PAID_BACKEND_RELEASE.md` (global $25 UTC-month
cap, 20 reservations/account/hour, service-only reservations/settlements).

## What it does

Given a caller-verified `TailoringResume` (headline, summary, skills, and
section/entry `title`/`description` only — no name, email, phone, website, or
personal location field exists on this type) and raw job-posting text, it:

1. Rejects immediately, with **zero provider calls**, if `consent` is false or
   `pro` is false. These are checked before anything else.
2. Builds the exact OpenAI Responses API request body it intends to send —
   fixed system instructions, the JSON-schema `text.format` constraint, and a
   user message whose content is `JSON.stringify({ resume, jobDescription })` —
   then serializes that *entire* body and reserves its worst-case cost via
   `reserveCost()` from `server/ai/cost.ts` (which already assumes
   `MAX_OUTPUT_TOKENS` output and enforces `MAX_INPUT_BYTES`). The injected
   `reserve()` runs on that worst-case number **before** any network call, so a
   budget-exhausted or rate-limited account never reaches the provider.
3. Makes exactly one `fetch` call, with a 30s `AbortSignal.timeout`. There is no
   retry loop anywhere in this module — a network error, timeout, or non-OK
   response is a terminal failure for the call, and the reservation is left
   exactly as `reserve()` set it (never settled down), matching the ledger's
   documented "unknown provider outcomes retain their reservation" rule.
4. Parses the Responses API envelope defensively (`status === 'completed'`,
   a `message` output item, an `output_text` content part, valid integer
   `usage.input_tokens`/`usage.output_tokens`) and independently re-validates
   the model's structured JSON against the resume it was given — the JSON
   Schema `strict` mode on the provider side is not trusted as the only gate.
5. Only after every suggestion in the batch passes validation does it compute
   `costMicroUsd(usage.input_tokens, usage.output_tokens)` and confirm that
   amount does not exceed the worst-case number that was reserved for this
   exact request; if it does, the provider's own usage report is treated as
   untrustworthy and the reservation is left as-is rather than settled past
   its own ceiling. Only then does `reservation.settle(...)` run with the real
   token counts. Settlement is all-or-nothing for the batch: a single invalid
   suggestion rejects the whole response and leaves the reservation unsettled,
   since a partially-trusted response gives no safe way to tell which
   remaining entries are trustworthy.
6. Returns plain `Suggestion` objects (`sectionId`, `entryId`, `field`,
   `originalText`, `suggestedText`). It never touches, applies, or persists
   anything — the caller's own accept/reject UI is what may eventually write
   `suggestedText` over `originalText`, and only after a human reviews it.

## Untrusted job text and prompt-injection posture

`jobText` is copied verbatim from a job posting and is never trusted. It is
placed only inside the JSON-encoded `user` message content, under a
`jobDescription` key, next to fixed system instructions that explicitly tell
the model to treat that field as reference data and to ignore anything inside
it that looks like a directive. This module performs no template
interpolation of job text into the instructions themselves, executes nothing
derived from it, and does not log it. This reduces prompt-injection risk but
does not eliminate it — a sufficiently adversarial job posting could still
influence which resume fields the model chooses to comment on, or the tone of
`suggestedText`. The output-side validation below is the actual safety
backstop, not the instructions.

## Output validation (the real trust boundary)

Every suggestion is checked against the *caller-supplied* resume, not against
anything the model claims:

- `field` must be one of the five known fields; `sectionId`/`entryId` must be
  `null` for `headline`/`summary`/`skills` and must reference a section/entry
  **that actually exists in the resume that was sent** for `title`/`description`.
  A suggestion naming any other id is rejected outright ("no nonexistent IDs").
- `originalText` must be **byte-for-byte identical** to the current text of
  that exact field. This is what "suggestions reference exact original text"
  means in practice — the model cannot claim to be editing text that differs
  even slightly from the source, which also blocks it from quietly rewriting
  the *original* alongside the suggestion.
- `suggestedText` must be non-empty, within `MAX_SUGGESTED_CHARS`, and
  different from `originalText` (a no-op "suggestion" is rejected as useless
  rather than silently accepted).
- A field whose current text is empty or whitespace-only is never offered as a
  suggestion target at all (`collectTargets()` filters it out) — there is no
  fact there to rewrite, so any suggestion naming it fails the "target exists"
  check below and the batch is rejected.
- At most one suggestion may target any given `(field, sectionId, entryId)`
  combination; a second suggestion for the same field is rejected as
  ambiguous rather than silently taking the first or last one.
- Every numeric token in `suggestedText` must already occur in that field's
  `originalText`, compared as a **complete-token multiset**, not a substring
  scan: tokens are matched with `\p{Nd}` (Unicode decimal digit, so
  Arabic-Indic, Devanagari, and other non-ASCII digit scripts count too, for
  the worldwide audience), bounded on both sides so a digit run is never
  matched as part of a longer one — "150" in the original does **not**
  license a suggestion containing "50" — and counted, so a number cannot be
  invented, and an existing single mention cannot be silently multiplied into
  several. Numbers reused from elsewhere in the resume (e.g. total years of
  experience mentioned only in another entry) are **not** permitted onto a
  field that didn't already contain them — this is intentionally
  conservative. (An earlier version of this check used a plain substring
  test, which is exactly the "150 licenses 50" bug this was corrected for.)
- The suggestions array is capped at `MAX_SUGGESTIONS` (8); anything larger is
  rejected rather than truncated, since silent truncation would hide the fact
  that the response didn't match what was asked for.
- The resume input itself is validated before any of the above: a
  null/non-object/array resume is rejected with `HttpError(400, ...)`, and
  every section id and entry id in the input must be globally unique (a
  duplicate id — within a section, across sections, or a section/entry id
  collision — is rejected). Both checks run in `assertResumeShape()`, before
  the request is even built, so a malformed caller input never reaches the
  provider.

None of this validates *truthfulness* beyond "these exact words already exist
in the resume." A rewrite that reuses only real words and real numbers from
the original text can still change its meaning in a way a human would
disagree with (e.g. reordering claims to imply a different scope of
responsibility). **This is a hard limit of automated validation, not a gap in
this implementation** — semantic correctness of a suggestion still requires
the human review step the caller's UI is expected to provide before anything
is applied. This module guarantees the suggestion is textually grounded in
the source; it does not and cannot guarantee it is a meaning-preserving edit.

## Contact-identifier exclusion

`TailoringResume` simply has no `name`, `email`, `phone`, `website`, or
top-level `location` field — there is nothing for a caller to pass even by
accident for those. Because a caller might still hand this module a richer
object (e.g. the app's full `Resume` type cast loosely), `toPayload()`
re-constructs the exact request payload key-by-key from only the fields this
type declares, rather than spreading or forwarding the input object, so any
extra properties on the input are structurally dropped before serialization.
A test (`provider input excludes fields beyond the tailoring resume shape`)
asserts this by passing an object with `email`/`phone` attached and checking
the literal request body. Entry-level `organization`/`location`/`dates` are
intentionally kept, since they describe a past employer, not the candidate,
and are needed for the model to write a relevant suggestion.

## Provider request shape

Built against the OpenAI Responses API (`POST /v1/responses`), matching the
official docs the parent session already checked for `server/ai/cost.ts`
(pinned model `gpt-4.1-mini-2025-04-14`, $0.40/$1.60 per 1M tokens):

- `store: false` — no server-side conversation retention.
- `tools: []` — no tool/function calling, no web/file access.
- `max_output_tokens: 3000` — from `MAX_OUTPUT_TOKENS` in `server/ai/cost.ts`,
  the same constant `reserveCost()` uses for the worst-case reservation, so
  reservation and request can never silently drift apart.
- `text.format` — a `json_schema` structured-output constraint (`strict:
  true`) requiring every suggestion to include its target, before/after text,
  and a bounded grounded `why`. This is defense in depth
  alongside, not instead of, the manual validation above.
- `input` — a `system` item carrying only the fixed instructions, and a
  `user` item carrying the JSON payload (`resume`, `jobDescription`, and only
  a bounded subset of current Match Analysis evidence) as a single
  `input_text` part. No image or file content parts are ever
  constructed, satisfying "text-only."
- `redirect: 'error'` on the `fetch` call — a redirected response is treated
  as a failure rather than silently followed, the same posture
  `authenticate()` in `server/http/security.ts` takes toward Supabase.
- The response body is read through a local `boundedJson()` helper capped at
  `MAX_RESPONSE_BYTES` (128 KiB), checking both a declared `Content-Length`
  and the actual streamed byte count, so a runaway or hostile response is
  never fully buffered into memory. `boundedBody()` in
  `server/http/security.ts` does the equivalent job for an incoming
  `Request`; it cannot be reused as-is here because its signature is typed
  against `Request`, not the `fetch` `Response` this module reads, so
  `boundedJson()` mirrors its declared/actual-size logic against a `Response`
  instead of importing it directly.

## What this module deliberately does not do

- It does not read `process.env` directly for the request path — only
  `tailoringConfig(env)` does, mirroring `server/billing/stripe.ts`'s
  `billingConfig(env)` pattern, and a caller decides when/if to call it.
- It does not implement consent storage, Pro entitlement checks, or the AI
  budget ledger itself — those are the three explicitly injected
  prerequisites (`consent`, `pro`, `reserve`), owned elsewhere per the billing
  SQL split noted in `docs/PAID_BACKEND_RELEASE.md`.
- It never retries a failed provider call. Automatic retries are explicitly
  disallowed because they could re-authorize spend against an already-placed
  reservation; a caller wanting a retry must make an entirely new call with
  its own fresh reservation and, implicitly, its own budget check.
- It never mutates the resume it was given, and never persists or logs
  resume content, job text, or raw provider responses. Thrown errors
  (`HttpError` from `server/http/security.ts`) carry only fixed, generic
  messages so nothing sensitive can leak through an upstream `safeError()`.

## Tests (`tests/server/tailoring.test.ts`)

All provider calls are mocked via the existing `fetcher` injection pattern
(same shape as `authenticate()` in `server/http/security.ts`); no real network
or `OPENAI_API_KEY` is used. 18 tests, all passing as part of `npm run
test:server` alongside the existing billing/security/cost/PDF suites:

- `tailoringConfig` fails closed when `AI_ENABLED` is unset/false or
  `OPENAI_API_KEY` is missing/malformed, matching the "default disabled" rule.
- Missing consent, missing Pro entitlement, and a rejected reservation each
  make **zero** `fetch` calls; consent/Pro are also confirmed to be checked
  before `reserve()` is ever invoked.
- A network timeout results in exactly one `fetch` attempt (no retry) and
  zero `settle()` calls (reservation retained).
- A non-OK HTTP response similarly leaves the reservation unsettled.
- Six distinct malformed/invented-output cases (invented percentage not in
  the source, a non-exact `originalText`, a nonexistent `sectionId`, a
  nonexistent `entryId`, a field/id combination that doesn't exist, and a
  no-op suggestion identical to the original) are each rejected with zero
  settlements.
- A number embedded inside a larger original number (original "150",
  suggested "50") is rejected — the regression test for the substring bug the
  token-multiset rewrite fixed.
- Numeric-token grounding is checked in a non-ASCII digit script
  (Arabic-Indic): reusing the exact same number is accepted and settled;
  introducing a different Arabic-Indic number not present in the original is
  rejected.
- A suggestion aimed at a blank (empty/whitespace-only) field is rejected.
- Two suggestions targeting the exact same `(field, sectionId, entryId)` are
  rejected as ambiguous.
- Duplicate ids in the resume input — two entries in one section, two
  sections, and a section/entry id collision — are each rejected with zero
  `fetch` calls.
- A `null`/`undefined`/string/number/array resume is rejected with
  `HttpError` status `400`, with zero `fetch` calls.
- A provider usage report far exceeding the reserved worst case is rejected
  and never settled.
- An oversized response body (streamed past `MAX_RESPONSE_BYTES` with no
  `Content-Length` to rely on) is rejected without being fully buffered, and
  never settled.
- A schema-level malformed response (`suggestions` not an array) is rejected.
- A valid response returns a suggestion whose `originalText` is asserted
  equal to the actual source field, and settles the exact `costMicroUsd`
  computed from the mocked usage numbers.
- The literal request body sent to `fetch` is asserted to have `store:
  false`, `tools: []`, `max_output_tokens: 3000`, a `json_schema` format,
  `redirect: 'error'`, and to carry adversarial job text only inside the
  `jobDescription` JSON field — never spliced into the system instructions.
- Extra fields (`email`, `phone`) attached to the input object are asserted
  absent from the literal serialized request body.

## Known limitations

- The numeric-claim filter is textual, not semantic: it cannot detect a
  fabricated non-numeric claim ("led the team" when the original never
  claimed leadership), only numbers absent from the source field. Semantic
  truth of any suggestion still requires user review before acceptance — this
  module does not and cannot certify that.
- Validation is intentionally all-or-nothing per response: one bad suggestion
  discards an otherwise-good batch. This trades a worse user experience
  (regenerate everything) for a much simpler, more auditable trust boundary.
- This module has not been exercised against the real OpenAI Responses API —
  only against hand-built mock payloads matching the documented envelope
  shape. The exact field names/nesting (`output[].content[].type ===
  'output_text'`, `usage.input_tokens`/`output_tokens`) should be re-verified
  against a live response before `AI_ENABLED=true` is ever set in production,
  per the acceptance gates already listed in `docs/PAID_BACKEND_RELEASE.md`
  item 6 ("AI authenticated Pro entitlement, consent, provider
  timeout/cost/validation, accept/reject UI and separate preserved source
  draft").
- No route, UI, consent-storage, or budget-ledger implementation is included
  here — this file documents the provider-call module only.
