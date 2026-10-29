# Group 1 — product strategy and measurement

Status on 2026-10-05: Tasks 1–5 are complete. Tasks 1 and 4 were reconfirmed against the live APWICO release and production instrumentation; Task 5 closed after the first privacy-safe live measurement review established the honest production baseline without treating unavailable or zero data as success or failure.

## 1. Primary product position — completed for redesign

**Product definition**

APWICO is a connected job-search decision workspace that helps a person evaluate a role, connect each requirement to evidence from their real experience, and prepare a truthful job-specific resume without changing the master resume.

**Tagline**

Evidence before effort.

**Core promise**

Choose the right role, prove the match, and tailor your resume without inventing experience.

**Product description**

APWICO helps people decide which roles deserve their effort. It separates a job into understandable requirements, shows what the person's resume does and does not demonstrate, asks the person to resolve uncertainty, and then creates a reviewable job-specific resume while the master resume remains unchanged. AI is subordinate to this workflow: it may propose grounded wording, but it does not invent qualifications, predict hiring, or decide whether a person should apply.

### Approved vocabulary

| Concept | Use | Avoid |
| --- | --- | --- |
| Product category | connected job-search decision workspace | AI resume generator as the complete description |
| Short brand idea | Evidence before effort | beat the ATS |
| Comparison | Match Analysis; evidence review | ATS score; hiring score |
| Positive evidence | Clearly demonstrated | guaranteed match |
| Adjacent evidence | Worth reviewing / partially demonstrated | probably qualified |
| Silence | Not demonstrated | missing skill; unqualified |
| Verified conflict | Confirmed incompatibility | inferred lack |
| Reusable document | Master resume | original file when storage meaning is unclear |
| Role-bound document | Job-specific resume | optimized master; overwritten resume |
| Proposed wording | AI suggestion | automatic improvement |
| Storage | Local draft; account-saved resume | saved without naming the destination |
| Opportunity | Saved job | application unless the person records an application |

### Claims APWICO deliberately avoids

- ATS-beating, ranking, pass-rate, or keyword-score promises.
- Guaranteed interviews, offers, hiring probability, or career outcomes.
- “Perfect resume,” “dream job,” or fabricated urgency.
- Invented user counts, testimonials, ratings, employer logos, expert endorsements, certifications, or research findings.
- Claims that cloud saving, paid access, AI, imports, extension capture, or regional availability exceed the verified production candidate.
- Claims that absence from a resume proves the person lacks a qualification.
- Claims that APWICO applied for a role or caused a later interview/offer.

## 2. Three primary entry journeys — definition completed

All starts converge on one master-resume model and one job model. Switching paths preserves safe entered state.

### Import-first — “I already have a resume”

1. Explain supported DOCX/text-PDF formats, local parsing, best-effort extraction, and review requirement before file selection.
2. Record import start, success or bounded failure category without filename/content.
3. Show recovered content as a reviewable local master draft.
4. Mark the master usable only after explicit review/confirmation.
5. Continue to job capture/Match or builder editing without re-import.

### Build-first — “I need to build a resume”

1. Begin with content, not visual style.
2. Ask for the minimum useful identity/direction, then flexible evidence sections.
3. Show a live preview; examples never become user claims automatically.
4. Reach a usable free document before a paid decision.
5. Preserve the draft across sign-in within the verified local/account boundary.

### Job-first — “I found a job”

1. Accept a supported captured URL or pasted description; keep source limitations explicit.
2. Extract required, preferred, and other signals.
3. Add/import/build a resume only when comparison requires it; preserve the job.
4. Show requirement-to-evidence results before tailoring.
5. Record the person's decision; tailoring creates a separate version and never overwrites the master.

## 3. North-star outcome — completed and verified on the redesign branch

**Metric**

Count of successful job-specific PDF or Word application-package exports after requirement-level evidence was reviewed.

**Qualifying conditions**

- Server-confirmed, non-empty PDF or DOCX response.
- Document scope is `job_specific`, not master.
- A requirement-level evidence row for the same job was genuinely visible before export.
- The review is behavior-based: merely loading a job, submitting a search, receiving an entitlement, or opening a summary panel does not qualify.
- Free and other bounded previews record `limited`; the full requirement ledger records `full`.
- Retries with the same committed export request do not inflate the count.
- Outbound analytics contains no identifiers or content. The server-only record contains only the owner and internal relational IDs, one-way bounded job/analysis keys, closed scope/format values, and timestamps needed to establish the conversion.

**Authoritative calculation**

The source of truth is the server-only `application_package_conversions` ledger, not client analytics. A conversion is inserted only after the existing export reservation is committed, the account-owned job-specific version resolves to the same bounded job identity as an earlier requirement-row review, and the request ID has not already converted. Master exports, local job drafts, failed exports and unreviewed jobs do not qualify.

## 4. Complete funnel — implemented and automatically checked

The canonical path is:

`public_landing → entry_selected → first_useful_input → master_usable → job_added → requirements_extracted → evidence_reviewed → decision_recorded → job_version_created → changes_reviewed → application_package_exported → application_status_recorded`

See `ANALYTICS_EVENT_SPEC.md` for event definitions, deduplication, properties, current mappings, and gaps.

## 5. Baseline — completed and reviewed in production

The dated production snapshot, capability inventory, current event counts, test coverage, privacy boundary, and known denominators are recorded in `PRODUCTION_BASELINE_2026-09-29.md`.

The first live review is recorded in `PRODUCTION_VALIDATION_2026-10-04.md`. It confirmed content-free funnel ingestion and the durable review/conversion schema. The qualifying-review denominator and conversion numerator were both honestly zero, so no rate was calculated. Search and field-performance providers likewise retained processing, low-sample or unavailable states instead of converting them to invented values.

The baseline remains explicit where the product has no event or where provider data is unavailable. Zero is never substituted for “not instrumented,” and low traffic is not treated as failed validation.

## Deliberately deferred, not Group 1 blockers

1. **Return-use window:** the event contract remains defined, while the reporting window is deferred until a durable active-search model exists. The working reporting proposal is a return on a different local calendar day within 30 days, aggregate only.
2. **Application outcomes:** the manual, owner-controlled application state and voluntary outcome foundation now exist. Public outcome claims still require a future adequate sample and methodology review.
3. **Repository protection:** branch protection and required CI affect the production repository and require a later owner-approved release-control action. No production setting was changed.

## Blueprint task status

| Task | Status | Evidence |
| --- | --- | --- |
| 1. Finalize the primary product position | [x] | Strategy, vocabulary, avoided-claims registry and public/private surface rollout are complete and covered by brand/content checks. |
| 2. Define the three primary entry journeys | [x] | Journey contracts and shared route/onboarding implementation are complete. |
| 3. Define the north-star outcome | [x] | Durable owner-scoped review/conversion records, behavior-based limited/full qualification, committed-export deduplication and privacy tests exist. |
| 4. Define the complete product funnel | [x] | The canonical content-free event path now covers landing through manual application status; server-authoritative review/conversion records remain the north-star source. |
| 5. Establish baseline product measurements | [x] | The dated pre-release snapshot and first live aggregate review are complete; production ingestion and durable zero-row north-star tables were verified without reading content or raw owner identifiers, and unavailable provider metrics remain explicitly unavailable. |
