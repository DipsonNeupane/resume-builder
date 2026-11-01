# ResumeStride workflow positioning experiment

Research brief only. No production copy, product behavior, Patina design, deployment, or SEO metadata was changed. Market and live-product review: September 27, 2026.

## 1. CUSTOMER PROBLEM

### Primary customer problem

Every promising job makes the candidate reconstruct the same context across disconnected places: what the role asks for, what their experience demonstrates, whether the role deserves effort, which resume version belongs to it, and which edits remain true. The cost is not merely “writing a resume.” It is repeatedly rebuilding the path from opportunity to application.

### Pain confidence

**High-confidence pains**

- **Search and application information becomes scattered.** Established products lead with replacing spreadsheets, bookmarks, and disconnected job boards; current public discussions repeatedly describe the same organizational failure. This establishes a real category-level pain, not a ResumeStride-specific claim. ([Teal Job Tracker](https://www.tealhq.com/tools/job-tracker), [Huntr](https://huntr.co/), [Careerflow Job Tracker](https://www.careerflow.ai/job-tracker))
- **Tailoring is repetitive work.** Competitors explicitly sell time saved from adapting a resume for each role, while career guidance continues to recommend role-specific tailoring. ([Simplify tailoring guide](https://help.simplify.jobs/articles/0515607-auto-tailoring-your-resume-with-copilot), [University of Waterloo guidance](https://uwaterloo.ca/career-development/sites/default/files/uploads/documents/env-tailoring-job-applications.pdf))
- **Resume versions lose their relationship to jobs.** Trackers now advertise attaching or selecting a resume for a specific job, and recurring public discussions describe not remembering which version was sent. These discussions are qualitative evidence only, not prevalence estimates. ([Teal tracking guide](https://help.tealhq.com/en/articles/14435727-how-to-track-your-job-applications), [Huntr Application Packets](https://help.huntr.co/en/articles/14367332-application-hub-and-packets), [public discussion](https://www.reddit.com/r/jobs/comments/1oa2eo4/))
- **People need to review AI-written application material for truth.** Career centers explicitly warn users not to submit AI output without review or let it invent experience, skills, accomplishments, or qualifications. ([UC Davis Career Center](https://careercenter.ucdavis.edu/resumes-and-materials/using-ai), [Oregon State career guidance](https://career.oregonstate.edu/sites/career.oregonstate.edu/files/2025-10/oregon-state-university-career-guide-2025.pdf))
- **Candidates need a way to prioritize, not only collect, opportunities.** Teal uses excitement ratings and keyword insights; match products lead with fit or alignment. The market clearly recognizes the decision problem, although products disagree on whether a score, keywords, or evidence is the right answer. ([Teal Job Tracker](https://www.tealhq.com/tools/job-tracker), [LinkedIn match ratings](https://www.linkedin.com/help/linkedin/answer/a7120158), [Jobscan](https://www.jobscan.co/))

**Plausible pains**

- Tab overload and constant switching reduce focus. This appears in product messaging and public discussions, but there is no reliable prevalence estimate in the reviewed evidence. ([Careerflow extension](https://www.careerflow.ai/browser-extension), [public discussion](https://www.reddit.com/r/jobs/comments/1oa2eo4/))
- Low-fit applications consume time that could go to stronger opportunities. This is strategically plausible and aligns with “quality over quantity” guidance, but ResumeStride does not yet have outcome data proving its Match Analysis changes application choices.
- A missing or expired posting makes interview preparation harder. Trackers consistently preserve job descriptions, but ResumeStride has not yet validated how often this becomes the purchase trigger.
- A protected master resume may reduce version drift and anxiety. The mechanism is credible; the emotional and behavioral impact still needs direct user research.

**Assumptions we still need data for**

- “Connected workflow” is more motivating than “resume builder,” “job match,” or “tailoring” for ResumeStride’s audience.
- Evidence states help people decide whether to pursue a job, rather than merely confirming a decision already made.
- Users will pay US$19.99 for the focused prepare-and-review workflow rather than for a bundle of individual Pro limits.
- The absence of post-application tracking is acceptable if the promise clearly ends at a reviewed, downloadable job-specific resume and an outbound job link.
- The future extension’s deliberately bounded site support covers enough real discovery behavior to strengthen acquisition and retention.
- The workflow story resonates across occupations, countries, career stages, and languages; current production analytics is far too small to establish this.

## 2. CURRENT MARKET POSITIONING

### Language customers already understand

| Category | Common market promise | Representative framing |
| --- | --- | --- |
| Resume builder / AI resume builder | Create a polished, ATS-friendly resume faster | Resume.io, Kickresume, Rezi |
| Resume matcher / scanner | Compare a resume with a job description; reveal keywords, gaps, or a score | Jobscan, LinkedIn, Teal |
| Job application tracker | Replace spreadsheets; save jobs; track stages, notes, follow-ups, and outcomes | Teal, Huntr, Careerflow |
| Job search platform / copilot | Put search, matching, tailoring, autofill, and tracking in one place | Simplify, Huntr, Careerflow |
| Browser job clipper / extension | Capture a job where it was found and carry it into a tracker | Teal, Huntr, Careerflow, Simplify |

“Workflow” is useful benefit language, but not an established standalone category. The clearest truthful category description is:

> **A connected resume and job-search workspace for deciding which opportunities to pursue and preparing a separate, reviewed resume for each one.**

For search and immediate comprehension, retain familiar descriptors nearby: resume builder, job search, Match Analysis, saved jobs, and job-specific resume tailoring.

### How competitors frame the problem

- **Document-first products** frame the problem as slow writing, weak formatting, missing keywords, or ATS readiness. ([Resume.io](https://resume.io/ai-resume-builder), [Kickresume](https://www.kickresume.com/en/), [Rezi](https://www.rezi.ai/ai-resume-builder))
- **Matcher products** frame it as an alignment or visibility problem, commonly expressed as a score and missing keywords. ([Jobscan](https://www.jobscan.co/), [LinkedIn](https://www.linkedin.com/help/linkedin/answer/a7120158))
- **Tracker products** frame it as organizational chaos: spreadsheets, bookmarks, lost descriptions, follow-ups, and pipeline stages. ([Teal](https://www.tealhq.com/tools/job-tracker), [Huntr](https://huntr.co/))
- **Integrated platforms** already frame the job search as one connected system. Simplify describes a profile powering matching, tailoring, autofill, and application tracking; Huntr connects saved jobs, base resumes, tailored resumes, application packets, and tracking; Careerflow says the search stays in one focused flow. ([Simplify](https://simplify.jobs/ai-job-search), [Huntr Application Packets](https://help.huntr.co/en/articles/14367332-application-hub-and-packets), [Careerflow extension](https://www.careerflow.ai/browser-extension))

### Where the market still fragments

The market is fragmented at the product-category level, but leading competitors increasingly connect those categories. ResumeStride must not claim that competitors only solve isolated features. More defensible gaps are qualitative:

- Many match experiences emphasize scores, keywords, or ATS optimization rather than a requirement-by-requirement distinction between demonstrated, partially demonstrated, and not demonstrated.
- Many AI builders emphasize generation speed or automatic optimization. Review and preserved originals exist elsewhere, but they are not always the organizing trust story.
- Some integrated platforms optimize through submission and post-application tracking. ResumeStride currently specializes in the narrower pre-application decision-and-preparation path.

## 3. RESUMESTRIDE WORKFLOW MAP

| Stage | Actual live functionality | Boundary / gap |
| --- | --- | --- |
| **DISCOVER** | Signed-in users can search opportunities sourced through the current provider across job portals and employer career sites, using role, country, region, workplace, employment type, and bounded salary preferences. Resume-derived role suggestions are available. | ResumeStride does not replace every job board, guarantee complete/global coverage, or continuously search in the background when the product is not in use. The extension is not public. |
| **EVALUATE** | Each result has Strong match, Good match, or Stretch; Match Analysis connects requirements to resume evidence using demonstrated, partial/worth-reviewing, and not-demonstrated states. Free gets a preview; Pro gets the full requirement breakdown. Missing evidence is not presented as proof that the user lacks a qualification. | It does not determine qualification, predict hiring, replicate an employer ATS, or prove that applying is worthwhile. A match is only as complete as the resume and job description. |
| **SAVE** | Free accounts can save up to three normalized job snapshots; Pro can save more within the documented abuse/storage ceiling. Saved descriptions and Match Analysis can remain available if a provider listing disappears. Duplicate-safe behavior exists. | This is a saved-job workspace, not an application tracker. There are no applied/interview/offer stages, follow-up reminders, notes/contacts workflow, or record of submission. |
| **PREPARE** | An active Pro user can create or reopen one persistent job-specific resume for a saved job. It starts from the master/current validated resume, stays separate, supports manual editing, and preserves the master. A changed master produces an explicit keep-or-reset choice. | It does not create job-specific cover letters, application answers, or a complete application packet. Cloud master-resume saving is not a universal live promise. |
| **REVIEW** | With explicit consent, Pro can request grounded tailoring suggestions for the saved job-specific resume. The user sees before/after and a reason, then accepts, rejects, or manually edits each change. Rejected changes do nothing; accepted changes affect only the job-specific version. | The system is designed and validated to constrain suggestions, but no model can justify an absolute “AI never invents” claim. The user must review every claim. |
| **APPLY** | The user can download the current resume as PDF or Word and open the source job in a new tab. The job-specific document remains tied to the saved opportunity inside ResumeStride. | ResumeStride does not autofill or submit the application, confirm that an application was completed, store the exact submitted artifact as an immutable application record, or manage anything after submission. The marketing promise must end at **ready to apply**, not **application managed**. |

## 4. DIFFERENTIATION

### Primary product promise

Start from one body of real experience, decide which opportunities deserve attention using evidence, then prepare a separate job-specific resume without changing the master or accepting AI edits blindly.

### Differentiation

The workflow itself is not unique. The stronger differentiation is the **evidence-and-control architecture across the workflow**:

1. Match language describes what the resume demonstrates, not a hiring prediction or an ATS percentage.
2. A saved opportunity can become its own persistent resume while the master stays separate.
3. AI changes are proposed one at a time with before/after context and an explicit accept/reject/manual-edit decision.
4. The workflow is designed for all occupations and countries rather than a narrow professional segment, with seven free templates, A4/Letter, Unicode, and right-to-left content support.
5. The product deliberately stops short of pretending it applied, tracked an application, or knows the hiring outcome.

Competitors offer parts—and sometimes most—of this combination. The defensible claim is a distinctive emphasis and product behavior, not “the only platform” or “the first complete workflow.”

### Trust promise

> ResumeStride shows what your resume supports, keeps uncertainty visible, preserves your master resume, and asks you to review every suggested change before it becomes part of a job-specific version.

### Pro value proposition

Free helps someone build the foundation and test the workflow. Pro is for the moment they choose to pursue real opportunities: deeper requirement evidence, more job discovery and saved opportunities, a persistent job-specific resume for each saved role, reviewable AI suggestions, and included PDF/Word downloads during a focused 30-day search period.

The purchase rationale is **depth and continuity around opportunities worth pursuing**, not “more AI” and not a promise of interviews.

## 5. THREE MESSAGING TERRITORIES

### Territory A — Evidence before effort (recommended)

- **Positioning statement:** For job seekers deciding where to invest limited time, ResumeStride is a connected resume-to-application workspace that shows what their experience demonstrates, preserves the master resume, and turns a chosen opportunity into a reviewed job-specific version.
- **Hero concept:** Know which opportunities deserve your effort—and why—before rebuilding a resume for them.
- **Supporting sentence:** Build one master resume, find or save a role, see the evidence behind the fit, then prepare a separate version you control.
- **Workflow framing:** Experience → opportunity → evidence → saved job → separate version → review → ready to apply.
- **Proof points:** Requirement-level evidence states; non-predictive match labels; master unchanged; saved job tied to a persistent job-specific resume; accept/reject/manual edit; PDF/Word.
- **Primary CTA:** Find jobs and see the match.
- **Secondary CTA:** Build my master resume.
- **Pro purchase rationale:** Move from a promising role to full evidence and a persistent, reviewed job-specific resume.
- **Risk / weakness:** Evaluation requires enough resume and job-description evidence. The message may underplay the builder for users who arrive before they have a usable resume.

### Territory B — One master, many opportunities

- **Positioning statement:** ResumeStride helps job seekers maintain one foundation and create a controlled, separate resume for each opportunity they choose to pursue.
- **Hero concept:** Stop rebuilding your resume from the last version you happened to send.
- **Supporting sentence:** Keep your experience in one master resume, connect roles to it, and make job-specific changes without losing the source.
- **Workflow framing:** Master resume → discover/evaluate → save → copy for the role → review changes → download.
- **Proof points:** Protected master; one version per saved job; explicit keep/reset when the master changes; preserved versions; manual editing and reviewed suggestions.
- **Primary CTA:** Build my master resume.
- **Secondary CTA:** See the job workflow.
- **Pro purchase rationale:** Turn selected saved jobs into persistent versions without resume-file chaos.
- **Risk / weakness:** Huntr, Simplify, and other products also use base/profile-to-tailored-version models. Without the evidence story, this territory is useful but not strongly differentiated.

### Territory C — Apply with intent

- **Positioning statement:** ResumeStride connects the decisions before an application so job seekers can pursue fewer roles blindly and prepare each chosen application with more context and control.
- **Hero concept:** From opportunity to ready-to-apply, keep the reason and the resume connected.
- **Supporting sentence:** See what the role asks, what your resume shows, and what to review before you download a job-specific version.
- **Workflow framing:** Find → understand → decide → save → prepare → review → apply elsewhere.
- **Proof points:** Transparent Match Analysis; saved description; clear constraints; job-specific document identity; external View job link; reviewed export.
- **Primary CTA:** See opportunities worth your attention.
- **Secondary CTA:** See how ResumeStride works.
- **Pro purchase rationale:** Buy the focused preparation layer after deciding the opportunity deserves effort.
- **Risk / weakness:** “Apply with intent” is emotionally strong but broad. Without an explicit “ready to apply” boundary, it can imply submission or application tracking that the product does not provide.

## 6. RECOMMENDED TERRITORY

Choose **Territory A: Evidence before effort**.

Workflow should be the frame; evidence and control should be the differentiator. This territory builds on Patina’s strongest existing storytelling—the evidence board, the journey rail, the protected master, and before/after review—without competing on an unsupported “all-in-one” claim. It also creates a natural Pro boundary: pay when an opportunity has earned deeper analysis and a job-specific preparation workflow.

Recommended positioning core:

> **ResumeStride connects one master resume to the opportunities you are considering, shows what your experience demonstrates, and helps you prepare a separate, reviewed version for the role you choose—without changing the master.**

## 7. HOMEPAGE STORY

Keep Patina and tell one progressive story rather than presenting a feature grid.

1. **Recognize the reset.** Open with the repeated moment: a promising role, scattered context, another resume copy, and uncertainty about what to change. The emotional problem is restarting, not a lack of tools.
2. **Reveal the connected path.** Use the existing Patina hero’s master-resume-to-opportunity transformation, but make the organizing idea explicit: one foundation moves through a single pre-application workflow.
3. **Show the boundary as a journey.** Present Discover → Evaluate → Save → Prepare → Review → Ready to apply. “Apply” visually exits ResumeStride to the employer; do not suggest submission or downstream tracking.
4. **Prove evaluation in the actual product.** Make Match Analysis the first deep proof: requirement beside real evidence; “not demonstrated” remains uncertainty, not incapability; no ATS score or hiring prediction.
5. **Prove continuity.** Show a saved job becoming a separate job-specific resume while the master visibly remains unchanged. Use the actual document identity and saved-job states, not an abstract feature card.
6. **Prove control.** Use the real before/after suggestion review with Accept, Reject, and manual edit. State that the system is designed to rework supplied experience and still requires the user’s review.
7. **Explain Pro at the moment of intent.** Free builds and explores. Pro deepens the evidence and keeps a persistent resume for the opportunities the user chooses to pursue. Keep the 30-day pass, included downloads, and non-preselected renewal clear.
8. **Close on an honest action.** Primary: Find jobs and see the match for users with a resume. Secondary: Build my master resume for users who need the foundation. Include a short boundary: download the reviewed resume and apply on the employer’s site.

## 8. EXTENSION ROLE

The extension can eventually make ResumeStride’s workflow **portable**, not universal:

> Find an opportunity in ResumeStride, or capture a supported public posting where you found it. Review the details, save it, and continue through the same Match Analysis and job-specific resume workflow.

This strengthens positioning because discovery can begin outside ResumeStride without splitting the downstream process. It does not make ResumeStride a replacement for every job board.

Messaging for after approval and verified availability:

- **Short:** “Found a role elsewhere? Capture a supported public posting, review it, and bring it into your ResumeStride workflow.”
- **Proof:** “Review the captured employer, role, source, and description before saving. Then continue to Match Analysis and, with Pro, a separate job-specific resume.”
- **Compatibility disclosure:** “Supports public Greenhouse postings, selected stable-URL Lever postings, and pages with one reliable JobPosting record. Workday works only when that record is present. LinkedIn and Indeed are not supported.”
- **Boundary:** “It does not apply to jobs, autofill applications, run background searches, or capture every website.”

Until publisher verification, genuine screenshots, production privacy text, and live acceptance are complete, keep all extension messaging out of production and label internal copy as future/draft.

## 9. VALIDATION PLAN

### Current evidence

Vercel Web Analytics is correctly installed with a privacy-closed event schema. In the inspected Production / last-24-hours view, the dashboard showed **17 visitors, 27 page views, and 71% bounce rate**. Only three custom events had data: `landing_page_view` (7 visitors / 10 total), `content_page_view` (5 / 6), and `tool_viewed` (2 / 3). The recently released growth baseline and current traffic include owner/test activity and are not suitable for a conventional A/B test or conversion claim.

The implementation already defines the useful funnel:

`landing_page_view → builder_started → resume_completed → jobs_viewed → match_opened/match_completed → tailoring_started → pricing_viewed → checkout_started → pro_activated`

Supporting signals include resume creation, job search, save, job-specific completion, suggestion review/accept/reject, upgrade prompts, checkout, and export.

### Recommended method: evidence ladder, then a sequential live test

1. **Message-comprehension interviews first.** Recruit a small, deliberately varied set of current or recent job seekers across occupations, career stages, and more than one country. Show the current story and a static/private workflow-led prototype in counterbalanced order. Ask them to explain what ResumeStride does, where it stops, what they expect after clicking, which role they would save, and why they would or would not pay. Treat findings as qualitative patterns, not percentages.
2. **Task-based prototype testing.** Give participants a realistic role and resume. Observe whether they can predict Discover → Evaluate → Save → Prepare → Review → apply elsewhere, and whether “not demonstrated” is understood as missing resume evidence rather than disqualification.
3. **Resolve claim confusion before live exposure.** A workflow concept fails if participants expect autofill, application submission, post-application tracking, universal extension capture, or guaranteed qualification.
4. **Run a time-boxed sequential live test only after qualitative clarity.** Keep the current homepage as the baseline until the recent Google recrawl stabilizes. Then expose one workflow-led version to all visitors for a fixed window. Compare directionally with the prior window, annotate acquisition mix and campaigns, and do not assign statistical significance. Do not rotate variants daily at this traffic level.
5. **Prefer behavioral chains over top-line clicks.** A stronger signal is more visitors continuing from homepage into Builder or Jobs and then reaching Match/save/pricing—not merely clicking a more dramatic hero CTA.

### Success signals by stage

| Stage | Primary signal | Interpretation guardrail |
| --- | --- | --- |
| Homepage | `landing_page_view`, primary/secondary CTA destination, optional coarse section reach | Separate acquisition changes from copy effects. A click alone does not prove comprehension. |
| Builder | `builder_started`, `resume_created`, `resume_completed` | Completion can lag across sessions; current privacy model does not identify people across devices. |
| Jobs | `jobs_viewed`, `jobs_search_performed`, result bucket | A Jobs view without a search may reflect curiosity or an auth/criteria barrier. |
| Match | `match_opened`, `match_completed`, `job_saved` | Saving is a stronger intent signal than opening. Do not interpret a match label as qualification. |
| Tailoring | `tailoring_started`, `suggestion_reviewed`, accepted **and rejected**, `job_specific_resume_completed`, export | Rejection is valid user control, not failure. Distinguish entitlement and missing-description blocks. |
| Pricing | `pricing_viewed`, `upgrade_prompt_viewed` by surface | More pricing views can mean value interest or a paywall interruption; pair with upstream stage. |
| Pro | `checkout_started`, `pro_activated` | At tiny counts, inspect individual operational failures without exposing identity; do not publish a conversion rate. |

**Scroll depth:** Vercel does not currently provide a trustworthy workflow-section funnel. If later needed, add only coarse, once-per-session section impressions through the existing closed schema (for example evidence/workflow/trust/pricing reached), with no resume text, job text, URL, user ID, or fine-grained scroll stream. CTA and downstream product events are more meaningful.

**Returning visitors:** the current privacy-closed setup does not provide a reliable person-level returning-visitor measure. Do not add fingerprinting or a persistent cross-site identifier to obtain it. Use aggregate repeat page activity cautiously and an opt-in follow-up question in research sessions instead.

**Qualitative feedback:** use moderated sessions, opt-in customer conversations, and a single optional question such as “What did you expect ResumeStride to do next?” Do not collect resume/job content in analytics.

## 10. SEO IMPLICATIONS

- **Homepage title/description:** do not change now. Google has just been asked to recrawl the corrected metadata. If workflow positioning validates later, preserve high-intent category terms such as resume builder, job match, and tailoring in the title; introduce the connected workflow in the description and on-page story rather than replacing understood search language with “workflow.”
- **Resources hub:** eventually organize content around the real sequence: keeping a master resume, deciding whether a role deserves effort, interpreting missing evidence, tailoring truthfully, managing job-specific resume versions, and preparing to apply. Do not imply post-application tracking.
- **Tools hub:** connect existing comparison/extraction tools to the Evaluate stage and their honest CTA destination. Future tools should solve one workflow decision rather than become a disconnected utility catalogue.
- **Editorial:** prioritize search-intent bridges such as “master resume vs tailored resume,” “how to know which resume you sent,” “how much should a resume change for a job,” “match score vs evidence,” and “how to use AI without inventing qualifications.” Validate topics with Search Console data after it accumulates.
- **Chrome Store listing:** after approval, use the exact capture → review → save → Match Analysis → job-specific resume story. Compatibility language must name bounded patterns, not “any job site.” Keep Store SEO adjacent to the website funnel and measure it through approved aggregate Store metrics plus bounded website UTM attribution.

## 11. CLAIMS WE MUST NOT MAKE

- “Your entire job search in one place,” “end-to-end job search,” or “all-in-one application platform.” ResumeStride does not manage the process after submission.
- “Tracks every application,” “remembers which resume you submitted,” “manages interviews/follow-ups,” or “tracks outcomes.” Saved jobs and job-specific resumes are not submitted-application records.
- “Applies for you,” “one-click apply,” “autofill,” or any suggestion that ResumeStride submits application forms.
- “Works with every job board/site,” “capture any job,” or current extension availability. LinkedIn and Indeed are intentionally unsupported; other support is conditional.
- “AI never invents,” “hallucination-free,” or “guaranteed truthful.” Say the system is designed to rework supplied experience, constrains suggestions, preserves the original, and requires review.
- “Tells you whether you are qualified,” “predicts hiring,” “guarantees interviews,” “beats the ATS,” or an employer-equivalent ATS/match score.
- “No missing evidence means no missing skill,” or the reverse. ResumeStride sees what the supplied resume and job description demonstrate.
- “Unlimited jobs,” “unlimited AI,” or “unlimited downloads.” Use the documented plan and fair-use limits.
- “Your master resume is synced everywhere” or a blanket cloud-storage promise. Current master-resume persistence varies by live configuration; job-specific versions have their own account-owned behavior.
- “Every opportunity gets its own resume” without the saved-job and active-Pro conditions.
- “One workflow” as a unique or category-first invention. Competitors already make connected-workflow claims.
- Any post-application benefit, hiring outcome, market-leading comparison, or quantified time/interview improvement without ResumeStride evidence.

