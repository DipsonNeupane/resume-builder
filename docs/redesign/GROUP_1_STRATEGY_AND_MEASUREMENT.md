# Group 1 — product strategy and measurement

Status on 2026-09-29: in progress. Strategy deliverables are finalized for redesign implementation; measurement implementation and owner policy choices remain.

## 1. Primary product position — completed for redesign

**Product definition**

ResumeStride is a connected job-search decision workspace that helps a person evaluate a role, connect each requirement to evidence from their real experience, and prepare a truthful job-specific resume without changing the master resume.

**Tagline**

Evidence before effort.

**Core promise**

Choose the right role, prove the match, and tailor your resume without inventing experience.

**Product description**

ResumeStride helps people decide which roles deserve their effort. It separates a job into understandable requirements, shows what the person's resume does and does not demonstrate, asks the person to resolve uncertainty, and then creates a reviewable job-specific resume while the master resume remains unchanged. AI is subordinate to this workflow: it may propose grounded wording, but it does not invent qualifications, predict hiring, or decide whether a person should apply.

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

### Claims ResumeStride deliberately avoids

- ATS-beating, ranking, pass-rate, or keyword-score promises.
- Guaranteed interviews, offers, hiring probability, or career outcomes.
- “Perfect resume,” “dream job,” or fabricated urgency.
- Invented user counts, testimonials, ratings, employer logos, expert endorsements, certifications, or research findings.
- Claims that cloud saving, paid access, AI, imports, extension capture, or regional availability exceed the verified production candidate.
- Claims that absence from a resume proves the person lacks a qualification.
- Claims that ResumeStride applied for a role or caused a later interview/offer.

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

## 3. North-star outcome — semantics completed, calculation blocked

**Metric**

Count of successful job-specific PDF or Word application-package exports after requirement-level evidence was reviewed.

**Qualifying conditions**

- Server-confirmed, non-empty PDF or DOCX response.
- Document scope is `job_specific`, not master.
- A requirement-level evidence view for the same saved job was deliberately opened before export.
- Retries with the same committed export request do not inflate the count.
- The metric contains no resume/job content, URL, email, account ID, job ID, request ID, or provider payload.

**Current blocker**

Vercel aggregate events cannot reliably join evidence review to a later owner-scoped export across sessions/devices. `match_opened` currently means a panel became visible. Export events now distinguish master, local job draft, and account-saved job-specific scope on the redesign branch, but a durable content-free conversion record—or a deliberately session-only metric—still requires owner policy approval before implementation.

## 4. Complete funnel — contract defined, implementation incomplete

The canonical path is:

`public_landing → entry_selected → first_useful_input → master_usable → job_added → requirements_extracted → evidence_reviewed → decision_recorded → job_version_created → changes_reviewed → application_package_exported → application_status_recorded`

See `ANALYTICS_EVENT_SPEC.md` for event definitions, deduplication, properties, current mappings, and gaps.

## 5. Baseline — captured where evidence exists

The dated production snapshot, capability inventory, current event counts, test coverage, privacy boundary, and known denominators are recorded in `PRODUCTION_BASELINE_2026-09-29.md`.

The baseline is intentionally incomplete where the current product has no event or product state. Zero must not be substituted for “not instrumented.”

## Owner decisions that genuinely remain

1. **North-star persistence:** session-only anonymous measurement, or owner-scoped durable content-free conversion records. Durable records are recommended for a reliable cross-session metric.
2. **Return-use window:** define “same active search.” Recommended starting definition: a return on a different local calendar day within 30 days of the first job interaction, reported only in aggregate.
3. **Application outcomes in Group 1:** approve whether basic user-controlled application status is introduced now as measurement foundation or remains Group 5 work. Recommended: define the event contract now; build the product state in Group 5.
4. **Repository protection:** approve adding branch protection and required CI before any release proposal.
