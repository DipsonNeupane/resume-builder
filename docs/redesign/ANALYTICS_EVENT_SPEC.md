# Group 1 analytics event specification

All events are outcome signals, not content telemetry. Event emission must never change product behavior, entitlement, quota, persistence, or error recovery.

## Required privacy contract

Allowed values are closed, bounded categories. Never send resume/job text, raw search terms, job titles, employer names, filenames, URLs, emails, names, account IDs, saved-job/version IDs, Stripe IDs, request IDs, hashes, prompts, model output, tokens, extension payloads, or free-form errors.

Every event must be tested for private-route stripping, account switches, duplicate React effects, retry behavior, failure categorization, and server-confirmed success where applicable.

## Canonical events

| Event | Fire exactly when | Deduplication boundary |
| --- | --- | --- |
| `public_landing_viewed` | canonical public entry renders | once per page load |
| `entry_journey_selected` | person chooses import/build/job-first | once per explicit choice; property `journey` |
| `first_useful_input_completed` | first valid content exists for the selected journey | once per journey instance |
| `import_started` | supported file selection begins | once per selection |
| `import_completed` | parser returns reviewable content | once per selection; `outcome=success` |
| `import_failed` | parser returns a bounded failure | once per selection; `failure_category` only |
| `master_resume_usable` | master passes validation and person confirms it | once per material resume revision |
| `job_added` | job snapshot/description is accepted | once per accepted source; `job_source` |
| `requirements_extracted` | bounded requirement set is produced successfully | once per analysis revision |
| `evidence_reviewed` | requirement-level evidence is deliberately opened | once per analysis revision; `review_depth=full` |
| `decision_recorded` | person chooses tailor, clarify, save for later, or keep looking | once per explicit action; `decision` |
| `job_specific_version_created` | server commits a new separate version | once per committed version, without sending its ID |
| `changes_reviewed` | person confirms the job-specific document after suggestions/manual edits | once per material version revision |
| `application_package_exported` | qualified job-specific PDF/DOCX succeeds after evidence review | once per committed export request |
| `application_status_recorded` | person manually records preparing/applied/interviewing/offer/closed/withdrawn | once per explicit status transition |

## Required bounded dimensions

- `journey`: `import_first | build_first | job_first`
- `user_state`: `anonymous | authenticated`
- `access`: `free | individual_template | pro | unknown`
- `surface`: `home | builder | jobs | match | tailoring | pricing | account | export | resources | tools`
- `document_scope`: `master | job_draft | job_specific`
- `storage_scope`: `local | account | unavailable`
- `job_source`: `search | extension | pasted`
- `review_depth`: `preview | full`
- `decision`: `tailor | clarify | save_later | keep_looking`
- `export_type`: `PDF | DOCX`
- `outcome`: `success | failure | blocked`
- `result_bucket`: `none | some`
- `failure_category`: closed import/search/export categories maintained in source, never raw messages

Device class comes from the analytics platform; do not fingerprint it in application properties. New-versus-returning must use the approved anonymous/session or owner-scoped policy, not a new cross-site identifier.

## Current event mapping and corrections

| Current event | Keep/use | Required correction |
| --- | --- | --- |
| `landing_page_view` | historical compatibility | map to canonical landing definition |
| `builder_started` | build-first start | add explicit journey; do not use for import/job-first |
| `resume_created` | first manual input | include imported success in canonical first-input metric |
| `resume_completed` | master usable | dedupe repeated confirmation; distinguish master/job-specific |
| `jobs_search_performed` | search completion | add start/error and do not call it job-added |
| `match_completed` | legacy analysis completion | rename semantically to requirements extracted; current search success is too broad |
| `match_opened` | preview visibility | must not count as requirement-level review |
| `job_saved` | job accepted | add source and duplicate result without content |
| `suggestion_accepted/rejected` | review actions | add manual rewrite/review-complete boundary later |
| `job_specific_resume_completed` | changes reviewed | add committed creation event separately |
| `export_completed` | successful server-confirmed export | document scope is now bounded; emit north-star only when qualification is proven |
| `checkout_started` | checkout handoff | preserve; it is supporting commerce, not north star |
| `pro_activated` | declared only | fire only from verified entitlement activation; otherwise remove from reports |

## Reporting denominators

- CTA rate: unique journey selections / eligible landing visitors.
- Import success: completed imports / import starts; failures split by category.
- Builder activation: first useful inputs / build-first selections.
- Master completion: usable master resumes / first useful inputs.
- Evidence review: full evidence reviews / successful requirements extractions.
- Decision rate: explicit decisions / full evidence reviews.
- North star: qualified committed exports; also show per full evidence review and per job-specific version.
- Every report must show the date range, environment, visitor/event basis, and known owner/test contamination.
