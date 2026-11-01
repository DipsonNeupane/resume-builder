# ResumeStride Product Blueprint

## Purpose

This document turns the competitive review into an actionable product backlog. It is designed to be worked through one group at a time without losing the larger product strategy.

ResumeStride should not become another generic “AI resume builder.” Its strongest position is:

> **Choose the right role, prove the match, and tailor your resume without inventing experience.**

The product should help a person answer three questions:

1. Is this role worth my effort?
2. What does my experience genuinely demonstrate?
3. How should I prepare a truthful, job-specific application while protecting my master resume?

## How to use this blueprint

- Treat each numbered group as a project milestone.
- Complete Group 1 before making large changes in later groups.
- Within each group, work through tasks in order unless a dependency says otherwise.
- Keep every feature truthful to what is actually available in production.
- Do not publish fabricated testimonials, hiring probabilities, ATS guarantees, user counts, outcome statistics, expert endorsements or employer logos.
- Preserve ResumeStride’s worldwide, all-occupation audience.
- Mark tasks with the status system below.

### Status key

- [ ] Not started
- [~] In progress
- [x] Completed and verified
- [!] Blocked or awaiting a decision

## Product principles

Every implementation decision should pass these tests:

1. **Evidence before effort.** Help people understand a role before asking them to rewrite a resume.
2. **No invented experience.** Suggestions may clarify, select or reorganize real experience, but must never silently add qualifications.
3. **The person decides.** ResumeStride explains evidence and uncertainty; it does not predict hiring or decide whether someone should apply.
4. **One connected search.** A master resume, job, evidence review, tailored version and application outcome should stay connected.
5. **The original stays safe.** Job-specific work must not silently overwrite the master resume.
6. **Worldwide by design.** Avoid US-only assumptions about names, addresses, phone numbers, dates, occupations, education or resume conventions.
7. **Transparent commerce.** Prices, renewals, cancellation behavior, access periods and product limits must be understandable before checkout.
8. **Accessible by default.** Keyboard access, screen readers, reduced motion, zoom, touch targets and readable error recovery are product requirements.
9. **Search value before search volume.** Publish useful pages with a real tool, example or expert-reviewed explanation. Do not mass-produce thin pages.
10. **Measure outcomes, not vanity.** A completed, reviewed application package is more meaningful than a page view or generated paragraph.

---

# Group 1 — Product strategy and measurement

## Group outcome

ResumeStride has one clear market position, three understandable entry paths and a measurable definition of product success.

## 1. Finalize the primary product position

**Status:** [ ]

**Objective:** Give the entire product one memorable promise that is meaningfully different from generic resume builders.

**Recommended direction:**

> Choose the right role, prove the match, and tailor your resume without inventing experience.

**What to change:**

- Use “Evidence before effort” as the short brand idea.
- Use the longer positioning sentence on the homepage, pricing page, product descriptions and partner materials.
- Describe ResumeStride as a connected job-search decision workspace, not just a document editor.
- Lead with the user’s decision and evidence, not AI, templates or ATS fear.
- Keep “AI” subordinate to the workflow: AI proposes grounded changes after the user chooses a role.
- Avoid promises such as “beat the ATS,” “guaranteed interviews,” “perfect resume,” or “land your dream job.”

**Deliverables:**

- One-sentence product definition.
- One short tagline.
- One paragraph product description.
- Approved vocabulary list for Match labels, job-specific versions, AI suggestions and storage.
- List of claims that ResumeStride will deliberately avoid.

**Done when:**

- A first-time reader can explain the product without mentioning only templates or AI.
- Homepage, pricing, tools and product documentation use the same core language.
- Every public claim maps to a production capability.

## 2. Define the three primary entry journeys

**Status:** [ ]

**Objective:** Let visitors begin from the situation they are actually in rather than forcing everyone through the same builder flow.

**Entry journey A — I already have a resume:**

- Import a supported PDF or Word document.
- Explain that extraction is best effort and requires review.
- Show the recovered master resume before moving into Match.
- Make it clear whether the draft is local or account-saved.

**Entry journey B — I need to build a resume:**

- Start with a blank, sample-guided or occupation-informed structure.
- Ask only for the minimum information needed at each step.
- Show a live preview without making design the first decision.
- Let users reach a usable free document without encountering a surprise paywall.

**Entry journey C — I found a job:**

- Accept a job URL where supported or a pasted job description.
- Extract required, preferred and other signals.
- Add or import a resume.
- Show requirement-to-evidence results before offering tailoring.

**Implementation notes:**

- All three journeys should eventually converge on the same underlying master resume and job models.
- A visitor should be able to change paths without starting again.
- Preserve data already entered when sign-in becomes necessary.

**Done when:**

- The three starts are visible and understandable on the public site.
- Each path reaches a meaningful result.
- Switching paths does not discard existing work.

## 3. Define the north-star outcome

**Status:** [ ]

**Objective:** Optimize the business for useful applications rather than raw resume creation.

**North-star metric:**

> Number of job-specific application packages exported after the user reviewed the role’s evidence.

**Why this metric matters:**

- It requires a usable resume.
- It requires a real opportunity.
- It requires an evidence review.
- It represents an intentional decision to pursue the role.
- It connects the free and paid parts of the product.

**Supporting definitions:**

- “Evidence reviewed” should mean the user opened or completed the requirement-level Match experience, not merely loaded a job.
- “Application package” can initially mean a job-specific PDF or Word resume. Cover letters may be added later.
- Count successful committed exports, not failed or abandoned attempts.
- Keep the metric anonymous or owner-scoped and content-free; never log resume or job text for analytics.

**Done when:**

- The event can be calculated reliably.
- Product decisions reference this outcome.
- The team does not treat signups, AI requests or template clicks as the primary success measure.

## 4. Define the complete product funnel

**Status:** [ ]

**Objective:** Identify where users understand the product, reach value, encounter friction and leave.

**Recommended funnel:**

```text
Public landing
→ Chosen start: import, build or job-first
→ First useful input completed
→ Master resume usable
→ Job added or discovered
→ Requirements extracted
→ Evidence reviewed
→ User decision recorded
→ Job-specific version created
→ Changes reviewed
→ PDF or Word exported
→ Application status recorded
```

**Track separately:**

- Anonymous versus signed-in visitors.
- Free versus individual-template versus Pro access.
- Desktop versus mobile.
- Build-first, import-first and job-first journeys.
- Search-discovered jobs versus browser-captured jobs versus pasted descriptions.
- New users versus returning active-search users.

**Privacy requirements:**

- Do not place resume content, job text, email addresses or job URLs in analytics properties.
- Use stable event names and bounded categorical values.
- Document what is collected in the privacy notice.

**Done when:**

- Every major step has one unambiguous event.
- Duplicate events do not inflate the funnel.
- Funnel reporting can show the largest drop-off by entry journey and device.

## 5. Establish baseline product measurements

**Status:** [ ]

**Objective:** Capture the current experience before redesigning it so improvements can be evaluated honestly.

**Baseline measures:**

- Homepage primary and secondary CTA rate.
- Builder start and first-field completion.
- Import start, success and failure category.
- Time to a minimally complete master resume.
- Template preview and template selection.
- Confirmation and successful document export.
- Job search start, success, empty result and error.
- Job saved and duplicate job detected.
- Match opened and requirement rows reviewed.
- Clarification started and completed.
- Job-specific version started.
- AI suggestion accepted, rejected or manually rewritten.
- Upgrade page viewed and checkout started.
- Return use during the same active search.

**Quality safeguards:**

- Confirm that events do not contain personal content.
- Test event behavior across account switches.
- Distinguish UI success from server-confirmed success.
- Record failure categories without sensitive payloads.

**Done when:**

- A baseline report exists.
- Important flows have denominators, not only event counts.
- Future redesign decisions can be compared against the baseline.

---

# Group 2 — Homepage and navigation UI

## Group outcome

A visitor understands the problem ResumeStride solves, sees credible proof and chooses the correct starting action without reading the entire page.

## 6. Simplify the homepage hero

**Status:** [ ]

**Objective:** Reduce the cognitive load of the first screen without losing the distinctive Patina identity.

**Recommended content hierarchy:**

1. Short problem or outcome headline.
2. One explanatory sentence.
3. One primary CTA.
4. One secondary CTA.
5. A compact proof strip.
6. A simplified product demonstration.

**Recommended headline direction:**

> Find the roles worth your effort.

**Recommended supporting direction:**

> ResumeStride connects each job requirement to evidence from your experience, then helps you prepare a truthful resume for the roles you choose.

**Visual recommendations:**

- Preserve the dark carbon, petrol, copper and paper language.
- Reduce the number of simultaneously competing cards.
- Show one role, two or three requirements and one clear decision.
- Make the user’s decision the visual endpoint.
- Ensure the demonstration remains legible at normal laptop sizes and on mobile.

**Done when:**

- The hero can be understood without studying the illustration.
- The illustration reinforces the text instead of carrying the entire explanation.
- The primary CTA remains visible without scrolling on supported viewports.

## 7. Make evidence comparison the primary CTA

**Status:** [ ]

**Objective:** Let visitors experience ResumeStride’s differentiator before committing to a full job search or resume build.

**Recommended CTA:**

> Compare my resume with a job

**Expected destination:**

- A no-signup or low-friction evidence-check flow.
- Clear choices to paste or import a resume and paste a job description.
- A sample option for users who are not ready to provide documents.

**UX requirements:**

- Explain what stays in the browser and what, if anything, is sent to a server.
- Set expectations about limited free analysis.
- Do not call the result an ATS score.
- Show a meaningful result before requesting an upgrade.

**Done when:**

- The primary CTA reaches a working evidence experience.
- Completion rate and continuation rate can be measured.
- The CTA label matches what happens next.

## 8. Keep building a resume as the secondary CTA

**Status:** [ ]

**Objective:** Continue serving visitors who only need a document without allowing the generic builder to obscure the product’s differentiation.

**Recommended CTA:**

> Build a resume free

**Supporting copy:**

- State the number of free templates accurately.
- State PDF and Word availability accurately.
- State whether an account is required for download.
- State that no payment card is required to begin.

**Consistency requirement:**

- Avoid saying “7 layouts” in one place and “27 layouts” elsewhere without explaining 7 Free plus 20 Premium.

**Done when:**

- Visitors can tell what is free before entering the builder.
- The CTA opens the correct builder state.
- The homepage uses one consistent template count explanation.

## 9. Add the three start cards below the hero

**Status:** [ ]

**Objective:** Make ResumeStride useful to visitors with different starting assets.

**Recommended cards:**

### Upload my resume

“Bring a Word or text-based PDF resume. It is parsed locally and always requires your review.”

### Build from scratch

“Create a flexible master resume with seven free designs and PDF or Word export.”

### Start with a job

“Paste a job description, separate its requirements and see what evidence your resume already contains.”

**Design guidance:**

- Use equal visual weight.
- Give each card a specific verb.
- Avoid generic “Get started” labels.
- Include one sentence about the expected next screen.

**Done when:**

- Each card starts its own coherent journey.
- The cards remain readable and tappable on narrow screens.
- Analytics distinguish which journey was selected.

## 10. Add a compact product-proof strip

**Status:** [ ]

**Objective:** Answer the most important objections without adding another large section.

**Recommended proof points:**

- Evidence instead of a fake score.
- Your original stays unchanged.
- PDF and editable Word.
- No card required to start.
- A4, Letter and right-to-left support.

**Guidance:**

- Use only four or five items at once.
- Keep every statement factual and qualification-aware.
- Link privacy or methodology claims to supporting pages.
- Do not use unsupported security seals or employer logos.

**Done when:**

- The proof strip is visible near the first conversion point.
- Each claim has supporting implementation or documentation.

## 11. Simplify the hero product illustration

**Status:** [ ]

**Objective:** Keep the visual storytelling while reducing reading effort and rendering cost.

**Recommended composition:**

- One saved role.
- Three requirements maximum.
- One direct evidence quote.
- One “worth reviewing” example.
- One honest unknown.
- One user decision.

**Performance guidance:**

- Render a complete static first frame before animation.
- Defer pointer-responsive WebGL until primary content has painted.
- Stop decorative motion after a short period.
- Honor reduced motion.
- Provide a non-WebGL fallback.

**Done when:**

- The visual remains meaningful when animation is disabled.
- It is readable on supported mobile layouts.
- Performance testing shows it does not materially harm LCP or interaction readiness.

## 12. Redesign primary navigation around product discovery

**Status:** [ ]

**Objective:** Expose the full product instead of presenting only homepage anchors.

**Recommended navigation:**

- Resume Builder
- Jobs & Match
- Free Tools
- Templates
- Resources
- Pricing

**Behavior recommendations:**

- Use real links for destinations so users can open them in new tabs.
- Keep anchor links only for true within-page navigation.
- Preserve sign-in or profile access.
- Use a clear mobile menu with Escape handling and focus restoration.
- Indicate the current destination.

**Done when:**

- Major destinations have permanent URLs.
- Browser Back and Forward behave predictably.
- Keyboard and mobile navigation pass verification.

## 13. Curate the public template showcase

**Status:** [ ]

**Objective:** Demonstrate design breadth without forcing visitors to scan all 27 templates.

**Recommended showcase:**

- Display approximately six representative designs.
- Include at least one Free design and several distinct Premium categories.
- Use larger previews instead of a long text-only list.
- Label Free, Premium, active entitlement and included-with-Pro states clearly.
- Make previewing different from purchasing.

**Selection criteria:**

- Traditional/general.
- Technical/projects.
- Academic/research.
- Leadership/executive.
- Healthcare/credential-focused.
- Early career/education-first.

**Done when:**

- Visitors can understand the range without scrolling through 27 rows.
- “View all templates” reaches a complete gallery.
- Access labels are accurate for signed-out, Free, individual and Pro states.

## 14. Build a complete template browsing experience

**Status:** [ ]

**Objective:** Turn templates into a useful discovery surface and an organic-search asset.

**Recommended filters:**

- Free and Premium.
- Traditional and modern.
- One-column and multi-column where applicable.
- Technical and project-first.
- Academic and research.
- Leadership.
- Healthcare and credentials.
- Early career.
- Dense and long-history.
- Right-to-left compatible.

**Each template detail should show:**

- Large preview.
- Description and intended use.
- Supported sections.
- A4 and Letter behavior.
- RTL behavior.
- Free or Premium access.
- Individual price where applicable.
- Included-with-Pro state.
- “Use this template” action.

**Done when:**

- All templates can be browsed without entering the builder.
- Filters are reflected in the URL when useful.
- Every template has a permanent indexable detail page.

---

# Group 3 — Onboarding and workspace UX

## Group outcome

Users can start from any entry path, understand where their work lives, move through the workspace predictably and recover from interruptions without losing context.

## 15. Create journey-specific onboarding

**Status:** [ ]

**Objective:** Replace one generic start with onboarding appropriate to the user’s situation.

**For import-first users:**

- Choose a file.
- Explain parsing limits before selection.
- Show extracted content and missing fields.
- Require review before confirming the master resume.

**For build-first users:**

- Ask for core identity and target direction.
- Let users add flexible experience types.
- Offer examples without inserting false claims.
- Defer visual customization until meaningful content exists.

**For job-first users:**

- Capture the job description.
- Extract requirements.
- Ask for a resume only when needed for comparison.
- Preserve the job while the resume is created or imported.

**Done when:**

- Each journey has specific progress language.
- Users do not encounter irrelevant steps.
- All paths converge into one consistent workspace model.

## 16. Deliver a no-signup evidence moment

**Status:** [ ]

**Objective:** Demonstrate the core value before asking for account commitment.

**Recommended limited result:**

- Extract up to a bounded number of job requirements.
- Show clearly demonstrated, worth reviewing and not demonstrated labels.
- Display source text beside evidence.
- Explain that “not demonstrated” is not proof the user lacks the qualification.
- Offer account creation to save the job, retain clarifications or create a persistent job-specific version.

**Privacy guidance:**

- Prefer browser processing where supported.
- Disclose server or AI processing before content leaves the browser.
- Do not retain anonymous resume or job text by default.

**Done when:**

- Anonymous visitors can see an authentic requirement-to-evidence result.
- Sign-up happens after value, not before it.
- The limited result does not falsely imply full Match depth.

## 17. Add a guided fictional sample

**Status:** [ ]

**Objective:** Let users understand the product without sharing personal information.

**Sample requirements:**

- Use an obviously fictional person, employer and role.
- Include direct evidence, adjacent evidence and an unknown.
- Show a user decision rather than a hiring verdict.
- Demonstrate that tailoring creates a separate version.
- Keep every AI suggestion grounded in the sample resume.

**Suggested controls:**

- “Try the sample.”
- “Use my resume instead.”
- “Use my job description instead.”

**Done when:**

- The sample teaches the complete concept.
- It never mixes with or overwrites a real draft.
- It works without account creation.

## 18. Give major workspace states permanent URLs

**Status:** [ ]

**Objective:** Make navigation, reloads, support and recovery predictable.

**States to address:**

- Builder.
- Jobs and recommendations.
- Saved jobs.
- Match Analysis.
- Master resume.
- Job-specific resume.
- Account.
- Pricing and template access.

**Implementation guidance:**

- Use real routes or carefully managed query parameters.
- Keep private pages noindex.
- Do not expose sensitive identifiers unnecessarily.
- Restore the same safe view on reload.
- Provide a useful fallback if the referenced object no longer exists.

**Done when:**

- Reloading a workspace URL does not unexpectedly return to the homepage.
- Support can direct users to a stable destination.
- Private states remain protected and noindex.

## 19. Make browser navigation reliable

**Status:** [ ]

**Objective:** Respect familiar browser behavior.

**What to improve:**

- Back should return to the previous meaningful workspace state.
- Forward should restore the state where safe.
- Opening public destinations in a new tab should work.
- Changing a template or minor editor tab should not flood history unless deep linking is valuable.
- Closing a modal should not unexpectedly navigate away.

**Testing:**

- Homepage → builder → jobs → saved job → job-specific resume → Back.
- Public tool → sign in → return to tool result.
- Pricing → checkout cancellation → return to correct product state.
- Mobile browser Back behavior.

**Done when:**

- Back and Forward pass documented workflows.
- Navigation never silently discards edits.

## 20. Preserve context across sign-in and recovery

**Status:** [ ]

**Objective:** Prevent account access from breaking the user’s active task.

**Contexts to preserve:**

- Selected template.
- Partially completed resume.
- Uploaded and reviewed resume.
- Job description.
- Evidence-check result where safe.
- Intended paid product.
- Intended destination after authentication.

**Safety guidance:**

- Prevent one account’s state from being applied to another account.
- Clearly resolve local versus cloud conflicts.
- Do not carry sensitive state through insecure URL parameters.

**Done when:**

- Sign-in returns users to the intended step.
- Account switching cannot leak another user’s data.
- Recovery links do not discard local work.

## 21. Clarify document and storage concepts

**Status:** [ ]

**Objective:** Remove ambiguity about what is being edited and where it is stored.

**Required concepts:**

- **Master resume:** the reusable foundation.
- **Saved job:** the captured job snapshot.
- **Match Analysis:** the requirement-level evidence comparison.
- **Job-specific resume:** a separate version for one saved job.
- **Local draft:** stored only in the current browser or session.
- **Account-saved resume:** stored with the signed-in account when enabled.

**UI recommendations:**

- Show the active document name persistently.
- Show the storage state near the document name.
- Avoid vague “Saved” language without a destination.
- Use “Your master stays unchanged” where a job-specific copy is created.
- Provide a clear return path to the master resume.

**Done when:**

- Users can identify the document and storage scope at a glance.
- User tests do not confuse local saving with cloud saving.

## 22. Verify the complete responsive and accessible workflow

**Status:** [ ]

**Objective:** Make accessibility and mobile usability part of product completion.

**Viewport checks:**

- 320px narrow phone.
- 390px modern phone.
- Tablet portrait and landscape.
- Standard laptop.
- Large desktop.

**Interaction checks:**

- Keyboard-only completion.
- Visible focus through sticky headers and overlays.
- Screen-reader headings, labels and status announcements.
- 200% browser zoom.
- Reduced motion.
- Touch targets and horizontal scrolling.
- Error focus and recovery.
- Long names, long URLs and long occupation titles.
- RTL resume content.

**Failure checks:**

- Import failure.
- Export failure.
- Session expiry.
- Network interruption.
- Cloud save conflict.
- Duplicate job.
- Job description unavailable.

**Done when:**

- Documented scenarios pass across supported viewports.
- Critical tasks do not depend on hover, drag or animation.

---

# Group 4 — Trust, pricing and conversion

## Group outcome

Users understand the commercial model, storage behavior, AI boundaries and support options before making a commitment.

## 23. Present all purchase paths together

**Status:** [ ]

**Objective:** Remove confusion caused by presenting Free and Pro while mentioning individual Premium template subscriptions elsewhere.

**Recommended comparison:**

### Free

- Complete core builder.
- Seven Free templates.
- Exact document allowance.
- Exact job-search and saved-job limits.
- Match preview boundaries.

### One Premium design

- The selected template.
- Exact monthly price.
- Download entitlement for that template.
- Renewal and cancellation behavior.
- Explicit statement that this does not include Pro job-search features.

### Pro

- All Premium templates.
- Exact export policy.
- Full requirement-level Match.
- Saved-job and job-specific version benefits.
- Grounded tailoring features.

**Done when:**

- All purchase paths are visible on one pricing surface.
- A user can explain the difference without opening checkout.

## 24. Explain the individual-template subscription

**Status:** [ ]

**Objective:** Make the US$1.99/month option feel intentional rather than hidden or surprising.

**Required disclosures:**

- It is a recurring monthly subscription.
- It unlocks one named Premium template.
- It does not unlock every Premium template.
- It does not grant Pro Match or tailoring access.
- It renews until cancelled.
- Cancellation preserves paid access through the billing period.
- The user can preview before purchasing.

**UX recommendations:**

- Show the template name in every checkout and billing state.
- Show individual and Pro choices side by side.
- Never open checkout merely because a locked card was clicked.

**Done when:**

- Template preview and purchase are visibly separate actions.
- Checkout contains the same product and price shown beforehand.

## 25. Explain post-cancellation template behavior

**Status:** [ ]

**Objective:** Prevent uncertainty about documents created with a paid design.

**Questions to answer publicly:**

- Can the user keep editing the resume after access ends?
- Can the Premium template still be previewed?
- Can existing downloaded files still be used?
- Can the document switch to a Free template?
- When exactly does download access end?

**Recommended principle:**

- Existing user content should remain accessible.
- Paid design export should follow the documented entitlement period.
- Switching to a Free template should provide a clear recovery path.

**Done when:**

- The behavior is documented consistently in product UI, terms and support material.

## 26. Replace vague export language

**Status:** [ ]

**Objective:** Make document access predictable.

**What to change:**

- Replace “generous exports” with a concrete policy or plain fair-use explanation.
- State that PDF and Word share an allowance where applicable.
- Explain whether failed exports consume allowance.
- Explain reset periods accurately.
- Show remaining allowance in the workspace.

**Done when:**

- Users can determine whether they will be able to download before completing the document.
- Allowance UI matches server enforcement.

## 27. Put renewal and cancellation next to paid actions

**Status:** [ ]

**Objective:** Treat billing transparency as part of the interface rather than legal fine print.

**Required placement:**

- Pricing cards.
- Upgrade dialogs.
- Template unlock dialog.
- Checkout consent.
- Account billing page.

**Required information:**

- Recurring price.
- Billing frequency.
- Automatic renewal.
- How to cancel.
- Access-through date after cancellation.
- Refund eligibility link.

**Done when:**

- No paid CTA can be reasonably mistaken for a one-time purchase.

## 28. Create a factual trust section

**Status:** [ ]

**Objective:** Replace missing social proof with verifiable product trust while real customer evidence is gathered.

**Recommended topics:**

- Resume import is processed locally where that is the current behavior.
- Local drafts stay in the browser unless account saving is explicitly enabled.
- AI changes require user review.
- Suggestions are grounded in the user’s content.
- The original master resume stays separate.
- Payments use the documented payment provider.
- Account deletion and support routes are available.

**Design guidance:**

- Use plain-language explanations rather than security theater.
- Link to privacy, terms, methodology and support.
- Avoid icons or seals that imply an external certification that does not exist.

**Done when:**

- Every trust claim is verifiable.
- The section appears before or close to the first paid decision.

## 29. Build a real customer-proof program

**Status:** [ ]

**Objective:** Gather credible evidence instead of inventing testimonials or copying competitor patterns.

**Program components:**

- Ask for feedback after a successful export or recorded application outcome.
- Obtain explicit consent for public attribution.
- Offer anonymous attribution when preferred.
- Preserve the exact meaning of customer statements.
- Record the feature used and relevant context.
- Separate satisfaction feedback from claimed hiring causation.

**Useful proof formats:**

- Short verified quotes.
- Before-and-after workflow stories.
- Time-saved reports.
- Case studies that explain what the user changed.
- Aggregate outcomes only after the sample is large and methodology is published.

**Done when:**

- Public testimonials have consent and provenance.
- Outcome claims include scope and methodology.

## 30. Create permanent trust and commercial pages

**Status:** [ ]

**Objective:** Give users and search engines authoritative destinations for important questions.

**Pages to create:**

- Pricing.
- Security and data handling.
- AI and Match methodology.
- Support.
- Frequently asked questions.
- Billing, cancellation and refunds.

**Content requirements:**

- Use production behavior as the source of truth.
- Include revision dates.
- Link the pages from relevant product moments.
- Keep legal documents separate from plain-language explanations.

**Done when:**

- Important trust questions have a linkable answer.
- Support responses can reference a stable page.

---

# Group 5 — Jobs, Match and extension

## Group outcome

ResumeStride’s strongest differentiator becomes a coherent workflow from job discovery through application outcome.

## 31. Reposition the free evidence tool around search intent

**Status:** [ ]

**Objective:** Use language people search for while preserving ResumeStride’s anti-score position.

**Recommended public name:**

> Free Resume-to-Job Description Matcher

**Recommended differentiating subtitle:**

> See the evidence behind the match—without a fake ATS percentage.

**Content requirements:**

- Explain the labels before results appear.
- Clarify that the tool is not a hiring prediction.
- Use “resume job match,” “compare resume to job description” and “job description matcher” naturally.
- Keep the product’s internal term “evidence check” as a differentiator, not the only search-facing phrase.

**Done when:**

- The page addresses a recognizable search intent.
- The result remains requirement-level and evidence-based.

## 32. Make requirement evidence the center of Match

**Status:** [ ]

**Objective:** Ensure users understand why a requirement received a label.

**Each row should contain:**

- Employer requirement.
- Required, preferred or other classification.
- Source wording from the job description.
- Resume excerpt where available.
- Evidence state.
- Plain-language interpretation.
- Clarification action where appropriate.

**Avoid:**

- A dominant percentage.
- A single color without text.
- Treating absence as a confirmed lack.
- Hiding source wording behind several clicks.

**Done when:**

- A user can explain every label from visible source material.
- Color is not the only signal.

## 33. Connect free evidence checks to saved jobs

**Status:** [ ]

**Objective:** Convert demonstrated value into a persistent job-search workflow.

**Recommended continuation:**

- “Save this job and keep the evidence.”
- Explain account requirements before sign-in.
- Preserve the current job and result during authentication.
- Recompute server-authoritative Match after saving.
- Explain any difference between the limited free check and full saved-job analysis.

**Done when:**

- Users do not have to paste the same job again.
- Saved results are owner-scoped and recomputed safely.

## 34. Make the user decision explicit

**Status:** [ ]

**Objective:** Complete the “evidence before effort” model with an intentional decision.

**Decision options:**

- Tailor a version for this role.
- Clarify something first.
- Save for later.
- Keep looking.

**Behavior guidance:**

- Decisions should not be presented as system recommendations.
- “Keep looking” should not delete the saved job automatically.
- “Clarify” should return to the affected requirement.
- “Tailor” should create a separate version and preserve the master.

**Done when:**

- The workflow records an explicit user choice.
- The product never claims to decide whether the person should apply.

## 35. Add basic application tracking

**Status:** [ ]

**Objective:** Keep the opportunity connected after the resume is exported.

**Recommended statuses:**

- Interested.
- Preparing.
- Applied.
- Interviewing.
- Offer.
- Closed.
- Withdrawn.

**Requirements:**

- Status changes must be manual unless a source can be verified safely.
- Preserve status history where useful.
- Do not claim an application was submitted by ResumeStride.
- Allow a job to remain saved without an application.

**Done when:**

- Users can identify the next action for each saved job.
- Application outcomes can be measured with consent.

## 36. Add notes, contacts and reminders

**Status:** [ ]

**Objective:** Support active-search organization without turning ResumeStride into a generic CRM.

**Recommended additions:**

- Private job notes.
- Recruiter or contact name.
- Interview dates.
- Application deadline.
- Follow-up date.
- Next action.

**Safety and privacy:**

- Treat contact information and notes as private user data.
- Do not send reminders without explicit opt-in.
- Let users remove reminders independently of the saved job.

**Done when:**

- The user can see what needs attention next.
- Reminder behavior is explicit and reversible.

## 37. Build the public extension experience

**Status:** [ ]

**Objective:** Turn job capture into a visible product advantage once the public extension supports the advertised behavior.

**Public page should explain:**

- How to install the extension.
- Which job pages are recognized.
- What data is captured.
- When only a URL is saved.
- Why some jobs show “Details pending.”
- Authentication and ownership boundaries.
- Permissions requested by the published version.
- How duplicates are handled.
- How captured jobs continue into Match and tailoring.

**Marketing rule:**

- Describe only the currently published version, not a submitted or local candidate.

**Done when:**

- The extension page matches the Chrome Web Store version.
- Installation expectations are accurate.

---

# Group 6 — Technical SEO, accessibility and performance

## Group outcome

Public pages are technically discoverable, fast and accessible, while private application states remain protected from indexing.

## 38. Give public capabilities permanent URLs

**Status:** [ ]

**Objective:** Make each important public concept linkable and indexable.

**Potential destinations:**

- Resume builder.
- Resume import.
- PDF export.
- Word export.
- Job search.
- Match Analysis.
- Honest tailoring.
- Job-specific resume versions.
- Template library.
- Browser extension.
- Pricing.

**Requirements:**

- Public pages must render meaningful HTML without relying entirely on client-side state.
- Private workspaces must remain noindex.
- Canonicals must point to the intended public URL.

**Done when:**

- Every major marketing claim has a stable supporting page.

## 39. Create indexable pages for all templates

**Status:** [ ]

**Objective:** Improve template discovery and convert template-search traffic.

**Each page should contain:**

- Template name and clear preview.
- Free or Premium status.
- Individual price where applicable.
- Included-with-Pro state.
- Intended use cases.
- Supported content structures.
- A4 and Letter examples.
- RTL behavior.
- Accessibility and text-layer notes where supportable.
- Direct builder entry.

**Avoid:**

- Near-identical pages with only the template name changed.
- Claims that any template guarantees ATS success.

**Done when:**

- Each page provides unique practical value.
- Each page is linked from the gallery and sitemap.

## 40. Add appropriate structured data

**Status:** [ ]

**Objective:** Help search engines understand page type and relationships.

**Recommended types:**

- `WebSite` for the main property.
- `Organization` only with accurate organization information.
- `Article` for editorial guides.
- `BreadcrumbList` for tools, resources and templates.
- Appropriate `SoftwareApplication` or `WebApplication` markup for genuine product pages where valid.

**Rules:**

- Structured data must match visible content.
- Do not invent ratings, prices, reviews or availability.
- Validate generated JSON-LD.

**Done when:**

- Important public page types validate without misleading properties.

## 41. Add meaningful sitemap modification dates

**Status:** [ ]

**Objective:** Give crawlers accurate freshness signals.

**Implementation guidance:**

- Use the last meaningful content update, not every deployment timestamp.
- Update dates only when visible or substantive content changes.
- Keep private and noncanonical URLs out of the sitemap.
- Verify sitemap URLs return successful indexable responses.

**Done when:**

- Every sitemap date is truthful and reproducible.

## 42. Create unique social images

**Status:** [ ]

**Objective:** Improve recognition and click-through when pages are shared.

**Priority page types:**

- Homepage.
- Free tools.
- Major resource guides.
- Template pages.
- Match methodology.
- Extension page.

**Design guidance:**

- Use the Patina visual system.
- Include the page’s actual topic.
- Keep text readable at social-card size.
- Provide accurate alternative text.

**Done when:**

- High-value pages no longer all share one generic image.

## 43. Optimize font delivery

**Status:** [ ]

**Objective:** Preserve the brand typography without delaying first render.

**Recommended work:**

- Remove critical-path CSS `@import` for Google Fonts.
- Self-host fonts when licensing permits.
- Subset fonts by used characters and weights.
- Preload only genuinely critical font files.
- Use `font-display: swap`.
- Keep a visually compatible system fallback.
- Avoid downloading template fonts before the user needs them.

**Done when:**

- The page renders useful text immediately.
- Font loading does not cause disruptive layout shift.

## 44. Improve static asset caching and bundle delivery

**Status:** [ ]

**Objective:** Reduce repeat-load cost and unnecessary public-page JavaScript.

**Recommended work:**

- Serve fingerprinted assets with long-lived immutable caching.
- Split public acquisition code from private workspace features.
- Lazy-load PDF parsing, Word parsing, premium rendering and account-only tools.
- Audit unused CSS shared between builder, landing and templates.
- Preload only the primary public-page assets.
- Confirm compression for JavaScript, CSS, fonts and SVG assets.

**Done when:**

- Returning visitors can reuse fingerprinted assets.
- Public pages do not load large private-workspace modules unnecessarily.

## 45. Protect LCP and low-powered devices from decorative work

**Status:** [ ]

**Objective:** Keep the premium visual experience without making the first interaction expensive.

**Recommended work:**

- Render a complete static hero first.
- Initialize WebGL after primary content paint or idle time.
- Disable or simplify effects on low-powered or constrained devices where detectable without fingerprinting.
- Stop animation when off-screen or hidden.
- Retain the current reduced-motion behavior.
- Compare the animated version against a static version using real measurements.

**Done when:**

- The visual remains attractive without WebGL.
- Field performance meets defined Core Web Vitals targets.

## 46. Create a recurring technical quality gate

**Status:** [ ]

**Objective:** Prevent search, performance and accessibility regressions.

**Gate contents:**

- Production build.
- Type checking.
- Broken-link scan.
- Canonical and robots verification.
- Sitemap verification.
- Structured-data validation.
- Mobile overflow checks.
- Keyboard workflows.
- Automated accessibility checks.
- Reduced-motion checks.
- Public-page console errors.
- Core Web Vitals monitoring.
- PDF and Word smoke tests.

**Done when:**

- Releases fail visibly when a critical public or product boundary regresses.

---

# Group 7 — Content SEO and search architecture

## Group outcome

ResumeStride earns non-brand traffic through useful evidence-first tools, guides, templates and occupation resources rather than thin generated content.

## 47. Expand the evidence-first resource cluster

**Status:** [ ]

**Objective:** Establish topical authority around the product’s unique point of view.

**Priority topics:**

- How to compare a resume with a job description.
- How to separate required and preferred qualifications.
- What “not demonstrated” means.
- When a qualification is genuinely incompatible.
- How to evaluate a stretch role.
- How to clarify transferable experience.
- How to decide whether tailoring is worth the effort.

**Content requirements:**

- Show worked examples.
- Link to the relevant free tool.
- Avoid unsupported percentage rules.
- Explain uncertainty and limitations.

**Done when:**

- The cluster answers the full decision journey and links coherently to the product.

## 48. Build seven intentional content clusters

**Status:** [ ]

**Objective:** Organize content around user problems instead of an undifferentiated blog.

**Clusters:**

1. Resume-to-job comparison.
2. Job requirements and qualifications.
3. Honest resume tailoring.
4. Resume bullets and evidence.
5. Master versus job-specific resumes.
6. Resume formats, templates and exports.
7. Career transitions and transferable experience.

**For each cluster:**

- Create one authoritative hub.
- Add focused supporting pages.
- Link to tools and product flows.
- Include navigation to the next logical question.
- Avoid pages whose answers substantially duplicate another page.

**Done when:**

- Every article belongs to a deliberate cluster.
- Hub pages link to complete supporting coverage.

## 49. Create high-intent product landing pages

**Status:** [ ]

**Objective:** Compete for searches where users are ready to use a tool.

**Priority pages:**

- Free resume builder.
- PDF resume builder.
- Word resume builder.
- Import an existing resume.
- A4 resume builder.
- RTL resume builder.
- Job requirement extractor.
- Resume bullet checker.
- Resume-to-job description matcher.

**Each page should include:**

- A direct explanation of the task.
- A working product entry point.
- Honest free and paid boundaries.
- Examples.
- Limitations.
- Related resources and tools.

**Done when:**

- Product pages deliver actual utility rather than routing immediately to signup.

## 50. Turn template pages into useful resources

**Status:** [ ]

**Objective:** Make templates more than screenshots.

**Unique content possibilities:**

- Why the layout exists.
- What kinds of work history it handles well.
- How it treats projects, publications, credentials or progression.
- When a more conservative design is preferable.
- How long histories flow across pages.
- How A4, Letter and RTL affect the layout.

**Done when:**

- Template pages are meaningfully different from one another.
- Visitors can select a template based on document needs, not appearance alone.

## 51. Research the first occupation set

**Status:** [ ]

**Objective:** Choose occupational pages using evidence rather than assumptions.

**Selection inputs:**

- Search Console impressions.
- Internal job searches.
- Builder occupation titles.
- Saved-job categories.
- Existing user demand.
- Geographic diversity.
- Ability to produce accurate, reviewed examples.

**Portfolio guidance:**

- Include technical, healthcare, operations, education, service, skilled trades, research, creative and leadership work.
- Include early-career and career-transition cases.
- Do not focus only on US technology roles.

**Done when:**

- The selected occupations have documented demand and review capability.

## 52. Build high-quality occupation hubs

**Status:** [ ]

**Objective:** Help users create and evaluate resumes for specific kinds of work.

**Recommended hub contents:**

- Resume structure for the occupation.
- Relevant flexible sections.
- Example summary with factual placeholders clearly identified.
- Skills shown in context.
- Strong and weak bullet comparisons.
- Common job requirements.
- Requirement-to-evidence examples.
- Suitable ResumeStride templates.
- Regional terminology notes.
- Direct start in the builder.

**Content safety:**

- Never present generated credentials or duties as universal requirements.
- Distinguish examples from claims the user should copy.
- Encourage verification against a real job description.

**Done when:**

- Every hub is useful even before entering the builder.
- Examples are reviewed and occupation-appropriate.

## 53. Add regional and international guidance carefully

**Status:** [ ]

**Objective:** Serve worldwide users without shallow localization or harmful assumptions.

**Topics to handle:**

- Resume versus CV terminology.
- A4 versus Letter.
- Photo conventions.
- Date, address and phone formats.
- Language and writing direction.
- Credential naming.
- Local privacy considerations.

**Rules:**

- Do not infer resume convention from IP alone.
- Let users choose country, language and document convention.
- Have local guidance reviewed where practical.
- Avoid implying that one country’s practice applies worldwide.

**Done when:**

- Regional pages provide real differences, not only translated keywords.

## 54. Build an internal-linking system

**Status:** [ ]

**Objective:** Help users and search crawlers move through related problems naturally.

**Link relationships:**

- Articles → relevant free tool.
- Tools → methodology and next-step article.
- Occupation hubs → suitable templates.
- Templates → occupation use cases.
- Match content → saved-job workflow.
- Builder pages → import, export and privacy explanations.

**Guidance:**

- Use descriptive link text.
- Avoid giant repetitive footer link lists as the only architecture.
- Add breadcrumbs on deeper pages.
- Regularly check for orphan pages.

**Done when:**

- Every indexable page has a clear parent, related pages and next action.

## 55. Publish factual comparison content

**Status:** [ ]

**Objective:** Capture comparison intent while explaining ResumeStride’s philosophy.

**Safe comparison topics:**

- Evidence review versus keyword match percentage.
- Master resume versus tailored resume.
- PDF versus Word for applications.
- Resume builder versus design editor.
- Local resume storage versus cloud storage.
- Job tracker versus saved-job bookmark.

**Competitor comparison rules:**

- Use current public sources.
- Include a checked date.
- Link directly to competitor information.
- Describe strengths as well as limitations.
- Avoid unverifiable claims about private product behavior.

**Done when:**

- Comparison pages are balanced, sourced and maintained.

## 56. Run a search-performance review process

**Status:** [ ]

**Objective:** Expand content according to demonstrated demand.

**Review inputs:**

- Queries gaining impressions but few clicks.
- Pages with good clicks but poor product continuation.
- Cannibalizing pages.
- Indexing errors.
- Broken internal links.
- Occupations frequently searched inside the product.
- Tools with high completion but low account continuation.

**Decision rules:**

- Improve an existing page before creating a duplicate.
- Consolidate overlapping content.
- Remove or noindex pages that cannot provide unique value.
- Do not publish at a pace that exceeds review capacity.

**Done when:**

- Content expansion is tied to documented evidence and business outcomes.

---

# Group 8 — Growth, validation and global expansion

## Group outcome

ResumeStride builds credible authority, validates product outcomes and expands worldwide without compromising trust.

## 57. Publish the Match methodology

**Status:** [ ]

**Objective:** Make evidence classifications understandable and auditable.

**Methodology should explain:**

- How requirements are extracted.
- How required and preferred signals are distinguished.
- What counts as direct evidence.
- What creates “worth reviewing.”
- Why silence remains “not demonstrated.”
- When confirmed incompatibility is allowed.
- How user clarifications affect analysis.
- Known limitations.
- When AI is involved.

**Done when:**

- Users and reviewers can understand the logic without seeing proprietary implementation details.
- Public product language matches the methodology.

## 58. Form a multi-region advisory group

**Status:** [ ]

**Objective:** Validate that the product works across occupations and hiring cultures.

**Desired representation:**

- Resume or CV professionals.
- Recruiters or hiring managers.
- Career coaches.
- University career services.
- Workforce-development practitioners.
- Multiple regions and writing conventions.
- Technical and nontechnical occupations.

**Operating guidance:**

- Use structured reviews with specific questions.
- Disclose compensation or conflicts where relevant.
- Do not label advisors as endorsers without permission.

**Done when:**

- Important product and content decisions receive diverse professional review.

## 59. Develop institutional partnerships

**Status:** [ ]

**Objective:** Earn trust and distribution through organizations already helping job seekers.

**Potential partners:**

- Universities and colleges.
- Public libraries.
- Workforce programs.
- Refugee and newcomer employment services.
- Disability employment organizations.
- Professional associations.
- Career-transition communities.

**Value offered:**

- Free evidence tools.
- Educational materials.
- Transparent methodology.
- Group feedback sessions.
- Privacy-respecting workflows.

**Done when:**

- Partnerships create measurable usage or learning, not only logo exchanges.

## 60. Offer the free tools to career-support organizations

**Status:** [ ]

**Objective:** Turn the most differentiated tools into a useful public resource.

**Possible formats:**

- Shareable tool links.
- Classroom or workshop exercises.
- Printable evidence-review worksheets.
- Embeddable tool access only if privacy and maintenance are sound.
- Facilitator guides using fictional examples.

**Done when:**

- An organization can use the tools without requiring every participant to purchase a plan.

## 61. Publish original research responsibly

**Status:** [ ]

**Objective:** Build authority around evidence-based job searching.

**Possible research themes:**

- How often job postings distinguish required from preferred qualifications.
- Common ambiguity in job requirements.
- Differences between keyword overlap and demonstrated experience.
- What users choose to clarify before tailoring.
- How much a truthful tailored resume actually changes.

**Research requirements:**

- Use consented or properly anonymized data.
- Publish methodology and sample limitations.
- Avoid causal hiring claims.
- Do not expose resume, job or account content.

**Done when:**

- Research can withstand scrutiny and provides something genuinely new.

## 62. Collect meaningful product outcomes

**Status:** [ ]

**Objective:** Learn whether ResumeStride improves the job-search process.

**Voluntary outcomes:**

- Application prepared.
- Application submitted.
- Interview received.
- Offer received.
- Role declined or withdrawn.
- Time saved.
- Confidence or clarity improved.

**Interpretation rules:**

- Do not imply ResumeStride caused an interview or offer merely because it was used.
- Report response rates and sample sizes.
- Separate self-reported data from verified platform events.

**Done when:**

- Product claims can be supported by transparent, consented evidence.

## 63. Validate opt-in cloud saving before promoting it

**Status:** [ ]

**Objective:** Provide cross-device continuity without compromising local-first trust.

**Required validation:**

- Explicit user consent.
- Ownership enforcement.
- Revision conflict handling.
- Account switching.
- Deletion.
- Storage limits.
- Backup and recovery.
- Offline and interrupted-save behavior.
- Clear local versus cloud status.

**Marketing rule:**

- Do not advertise cloud saving until the production feature and recovery procedures are verified.

**Done when:**

- Users can intentionally save, recover and delete account documents.
- Failure modes do not silently overwrite work.

## 64. Prepare worldwide paid access

**Status:** [ ]

**Objective:** Align the worldwide audience with actual commercial availability.

**Work areas:**

- Supported billing countries.
- Local currency display.
- Taxes and invoices.
- Consumer renewal disclosures.
- Refund handling.
- Payment-method availability.
- Pricing presentation across currencies.
- Support and cancellation operations.

**Product guidance:**

- Keep Free access useful worldwide even while paid availability expands.
- Show regional unavailability before checkout.
- Avoid displaying an unavailable paid CTA as if it will work.

**Done when:**

- Paid availability, currency and terms are accurate for each supported market.

## 65. Localize based on measured demand

**Status:** [ ]

**Objective:** Expand language access with complete, maintainable support.

**Localization scope:**

- Public marketing pages.
- Builder interface.
- Validation and error messages.
- Emails and billing messages.
- Privacy and commercial disclosures.
- Help content.
- Resume section defaults while keeping them editable.

**Implementation principles:**

- Let users select language explicitly.
- Do not infer language solely from IP location.
- Use locale-aware number, date and currency formatting.
- Preserve brand names and identifiers from accidental translation.
- Test text expansion and RTL interfaces where supported.
- Start with a small number of fully maintained languages.

**Done when:**

- A supported language covers the complete critical journey, not only the homepage.

---

# Recommended execution order

This is a dependency order, not a calendar schedule.

1. **Group 1 — Product strategy and measurement**
2. **Group 2 — Homepage and navigation UI**
3. **Group 3 — Onboarding and workspace UX**
4. **Group 4 — Trust, pricing and conversion**
5. **Group 5 — Jobs, Match and extension**
6. **Group 6 — Technical SEO, accessibility and performance**
7. **Group 7 — Content SEO and search architecture**
8. **Group 8 — Growth, validation and global expansion**

Groups 2 and 3 may share design work. Groups 6 and 7 should coordinate URL structure, metadata and internal linking before large content production begins. Group 8 should use evidence collected from the earlier groups rather than relying on unverified marketing claims.

# Master completion checklist

- [ ] Product positioning is consistent and differentiated.
- [ ] The three entry journeys are complete.
- [ ] The core funnel is measurable without collecting content.
- [ ] The homepage communicates value immediately.
- [ ] Navigation uses stable public and private destinations.
- [ ] Workspace state survives appropriate reload and sign-in flows.
- [ ] Pricing and recurring terms are transparent.
- [ ] Trust claims are factual and documented.
- [ ] Match keeps requirements beside source evidence.
- [ ] Application tracking remains user-controlled.
- [ ] Public pages are crawlable, fast and accessible.
- [ ] Private application states remain noindex and owner-scoped.
- [ ] Templates have useful individual pages.
- [ ] Content clusters provide real examples and tools.
- [ ] Occupation coverage remains worldwide and reviewed.
- [ ] Research and testimonials have consent and methodology.
- [ ] Cloud saving is promoted only after production validation.
- [ ] Paid availability is represented accurately by region.
- [ ] Localization covers complete user journeys.

# Competitive reference set

These public products informed the original analysis and should be rechecked before publishing direct comparisons because features and prices change:

- [ResumeBuilder.com](https://www.resumebuilder.com/)
- [Resume.com](https://www.resume.com/)
- [MyPerfectResume](https://www.myperfectresume.com/)
- [Kickresume](https://www.kickresume.com/)
- [Resume.io](https://resume.io/)
- [Zety](https://zety.com/)
- [Teal](https://www.tealhq.com/)
- [Rezi](https://www.rezi.ai/)
- [Enhancv](https://enhancv.com/)
- [Novoresume](https://novoresume.com/)
- [Jobscan](https://www.jobscan.co/)
- [Canva Resume Builder](https://www.canva.com/create/resumes/)

# Final product test

When this blueprint is substantially complete, a new visitor should be able to say:

> “ResumeStride helps me decide which jobs deserve my effort, shows the evidence my resume contains for each requirement, and lets me create a truthful version for that job without damaging my original.”

If the product is primarily described as “an AI resume builder with templates,” the differentiation has not yet been made clear enough.
