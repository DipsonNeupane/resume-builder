# ResumeStride professional redesign research

Date: September 25, 2026
Scope: research and redesign direction only. No product behavior, route, pricing,
storage, export, AI, billing, extension, or cloud behavior changed.

## Executive recommendation

Do not replace the current experience or rebuild it around a fashionable template.
ResumeStride already has a distinctive and credible foundation: an editorial public
site, a guided resume workflow, a clear master-versus-tailored-resume model, restrained
color, readable typography, responsive layouts, visible focus, and an unusually honest
AI story.

The professional redesign should be an **evolution into one coherent career workspace**:

- retain the existing cobalt, ink, warm-white, Manrope, and DM Sans identity;
- make the working product—not only a finished resume—the main visual proof;
- simplify mobile navigation and keep primary fields unobscured;
- use a single documented product design layer instead of accumulating CSS overrides;
- ship page by page behind the existing behavior and regression tests;
- validate comprehension and task completion with representative users before polishing
  secondary detail.

The desired perception is not “another template marketplace.” It is:

> A calm, trustworthy workspace that helps people turn one truthful career history into
> a relevant application.

## What is already strong

1. **The positioning is differentiated.** “One career. More than one version.” explains
   the master/tailored model more clearly than a generic “build a winning resume” claim.
2. **The visual direction is credible.** Ink navy, cobalt, warm neutral surfaces, a serif
   accent, and restrained corners feel more editorial and professional than a generic
   SaaS gradient-and-card treatment.
3. **The product journey is coherent.** Resume → Opportunities → Match → Tailor →
   Application gives the broader product a useful mental model.
4. **Trust is built into the copy.** “AI suggests. You decide.” and the evidence language
   avoid pretending that a match score determines a person's capability.
5. **The interface already includes strong fundamentals.** Product controls have visible
   focus, primary controls meet a 44px target, reduced motion is honored, inputs are
   labeled, the modal uses native dialog behavior, and the resume document styles are
   intentionally separate from product chrome.
6. **The homepage is already visually polished at desktop and mobile sizes.** The redesign
   should improve proof, hierarchy, and continuity—not discard the current brand.

## Where the experience falls short of “gold standard”

### 1. The homepage explains more than it demonstrates

The hero proves that ResumeStride can render a resume, but most of the distinctive value
appears later as prose: opportunity search, evidence-based matching, separate versions,
and accept/reject tailoring. Leading products make their core workflow tangible with
real interface views. Teal, for example, prominently connects resume editing, job matching,
analysis, and multiple versions. ResumeStride should not copy Teal's scoring language, but
it should show its own safer workflow earlier.

**Direction:** keep the current hero copy and resume specimen, then replace some repeated
explanation below it with a focused three-frame product demonstration:

1. Build the master resume.
2. Compare it with an opportunity using evidence.
3. Review a separate tailored version before downloading.

Use real ResumeStride components and fictional data. Do not use invented customer counts,
testimonials, interview rates, ATS guarantees, or employer logos.

### 2. Mobile has too much navigation before the task

The mobile builder stacks the product header, a horizontally scrolling five-step journey,
document identity, a second horizontally scrolling section selector, and utility actions
before the first field. This is understandable, but it makes the product feel like it is
managing the interface rather than helping the user write.

More importantly, the fixed bottom-right `.builder-view-toggle` visibly overlaps form
content at narrow widths. A persistent control must not obscure a focused field or its
value. WCAG 2.2 also requires focused items not to be completely hidden by authored
persistent content.

**Direction:** on mobile, show one compact context row (“Resume · Personal details · 0/5”)
with a clear section menu. Put Edit/Preview in a deliberate, full-width task switcher or a
bottom dock that reserves layout space and moves safely above the on-screen keyboard.
Keep the full career journey on Home and Jobs, but do not make it compete with form entry.

### 3. The product surface and marketing surface need more continuity

The homepage is spacious and editorial. The builder becomes a dense workbench with several
horizontal bands. Both use the same tokens, but the transition can feel like moving to a
different product. Account and Pro are visually related but each has another composition.

**Direction:** establish one application shell:

- shared 72–80px header behavior;
- one location for page identity and save/account status;
- one compact journey treatment;
- consistent page widths and section headers;
- a single convention for primary, secondary, quiet, and destructive actions;
- consistent empty, loading, error, success, and upgrade states.

### 4. The styling architecture is safe today but expensive to evolve

`src/main.tsx` imports `styles.css` and then `design-system.css`. The latter intentionally
overrides many legacy selectors. This allowed a safe incremental migration, but continued
redesign work will make specificity, regressions, and responsive behavior harder to reason
about.

**Direction:** do not perform a big-bang CSS rewrite. Introduce an explicit cascade:

1. tokens;
2. reset/base;
3. reusable product components;
4. page layouts;
5. resume-document styles;
6. narrowly documented compatibility overrides.

Migrate one surface at a time and delete an old rule only after its rendered states and
export dependencies are covered. The resume markup and server PDF/DOCX presentation must
remain independent from product-shell changes.

### 5. The design system exists as CSS, not yet as a complete product contract

The current tokens cover color, typography, borders, radii, focus, and shadows. The next
level is to define interaction and content rules: density, control hierarchy, state copy,
page anatomy, responsive behavior, and when a card is warranted.

**Direction:** document and implement these primitives before page-by-page polish:

- Button: primary, secondary, quiet, destructive, icon-only;
- Field: label, input, hint, error, optional/required state;
- Status: saved, saving, warning, error, success, Pro;
- Section header and page header;
- Tabs/segmented control;
- Navigation item and progress item;
- Empty state, skeleton, notice, modal, and confirmation;
- Job card, evidence row, and suggestion comparison;
- App shell, workbench, and public editorial section.

## Recommended information architecture

### Public website

1. Header: How it works, Templates, Pricing, Sign in, primary Build CTA.
2. Hero: retain the current positioning and two start paths.
3. Product proof: a real three-stage Resume → Match → Tailor demonstration.
4. Why it is trustworthy: master stays unchanged, evidence is explained, user approves AI.
5. Templates: show the seven choices without turning the product into a template gallery.
6. Pricing: keep Free and Pro directly comparable with exact limits and renewal language.
7. Confidence/footer: privacy, local import behavior, support, accessibility, legal.

The current “journey,” workflow, evidence, and AI sections repeat parts of the same story.
Combine them where doing so shortens the page without losing the product's careful language.

### Signed-in/product website

- **Resume:** guided content entry plus live preview.
- **Opportunities:** search preferences, saved jobs, and results.
- **Match:** evidence for the selected saved job, not a disconnected destination.
- **Tailor:** a review queue with original/suggested text and explicit accept/reject.
- **Application:** final resume version, download, and future application state.

The journey can remain the global mental model while the current task gets stronger local
navigation. Avoid exposing two equally prominent progress systems on a phone.

## Surface-by-surface direction

### Home

- Keep the current hero; reduce manual line breaks at intermediate widths and use balanced
  wrapping where possible.
- Make the right-side specimen interactive only when the outcome is clear; otherwise keep it
  a visual proof and add an obvious “See how it works” route to the product demonstration.
- Show actual Match and Tailor UI with fictional data above the template section.
- Add trust facts that are already true. Avoid badges that imply certifications not held.
- Keep one primary CTA label throughout the public page unless a button truly performs a
  different action.

### Builder

- Desktop ≥1250px: preserve the current three-column edit/live-preview layout.
- Tablet: use an explicit Edit/Preview segmented control near the page title.
- Mobile: collapse global and local progress into one compact context bar; ensure Preview
  never covers a field, validation message, or keyboard focus.
- Keep auto-save status visible but quiet. Escalate only when saving fails or storage needs
  attention.
- Preserve the guided Next/Confirm behavior and every validation/focus rule.

### Opportunities and Match

- Keep filters sticky on desktop and collapsible on mobile.
- Make saved jobs a stable workspace, not a secondary block after search results.
- Present each match requirement as requirement → evidence → status → next action.
- Never rely on green/orange alone; retain explicit labels.
- Keep “not demonstrated” language and clarification controls; they are a trust advantage.

### Tailor

- Preserve original and suggested content side by side on wide screens and stacked with
  strong labels on mobile.
- Keep Accept and Reject at the suggestion, not only at the page level.
- Always show that the master resume is unchanged and identify the target job/version.
- Avoid celebratory animation that implies the AI result is objectively correct.

### Account and Pro

- Use the same application shell and page-header anatomy as Resume and Opportunities.
- Keep one-time purchase versus automatic renewal explicit and visually separate.
- Show unavailable billing as a clear state, not an empty or broken panel.
- Treat price and renewal language as product data with regression coverage, not decorative
  copy.

## Accessibility and quality baseline

Continue targeting WCAG 2.2 AA. In particular:

- minimum target size or sufficient separation for every action;
- a strong, high-contrast focus indicator;
- no sticky header, preview switcher, toast, or bottom dock obscuring focus;
- semantic controls and labeled fields;
- status and validation announcements that do not disappear before they can be understood;
- reduced-motion behavior;
- zoom, long text, Unicode, RTL, A4, and US Letter support;
- no meaning conveyed by color alone;
- responsive tests at 320, 375, 768, 1024, 1280, and 1440px widths;
- real keyboard, screen-reader spot checks, and browser-engine coverage in addition to axe.

## Functionality-preserving delivery plan

### Phase 0 — Baseline and contract

- Inventory every route, state, control, responsive breakpoint, and export dependency.
- Capture screenshots for Home, Builder edit/preview, Jobs empty/results/saved/match, Tailor,
  Account, Pro, modal, errors, loading, and recovery states.
- Map existing browser tests to those states and add missing behavior assertions before
  changing layout.
- Record baseline Core Web Vitals and bundle sizes; do not trade polish for a slower first
  interaction.

### Phase 1 — Foundations

- Formalize tokens and product primitives.
- Introduce the shared app shell and page-header conventions.
- Fix the mobile preview overlap and simplify mobile task context.
- Make no data-model, storage, API, entitlement, or export changes.

### Phase 2 — Public site

- Prototype two homepage variants in low fidelity.
- Test whether people can explain ResumeStride's difference after 5 seconds and identify
  the correct first action.
- Replace repeated prose with the real three-stage product demonstration.

### Phase 3 — Core workbench

- Migrate Builder, then Opportunities/Match, then Tailor.
- Use small pull requests with visual and behavioral evidence for each state.
- Preserve component props and handlers unless a separately reviewed behavior change is
  explicitly required.

### Phase 4 — Account, Pro, and system states

- Apply the shared shell and primitives.
- Verify purchase, renewal, sign-in, recovery, quota, consent, and error copy exactly.

### Phase 5 — Validation and refinement

- Run the full default/auth/paid/accessibility/export/browser matrix.
- Test with representative users grouped by task rather than occupation alone: starting
  from blank, importing an existing resume, tailoring to a job, keyboard/assistive-tech use,
  and narrow-screen use.
- Start with about 5 qualitative participants per meaningfully different task group, then
  iterate in small rounds rather than waiting for one large final study.

## “Do not break” acceptance gates

Every redesign increment should pass all relevant gates:

1. A guest can start blank, upload, edit, preview, and retain the current session behavior.
2. Personal and section validation still focuses the correct field.
3. Next, Confirm, Download, and edit-after-confirm behavior are unchanged.
4. All seven templates, both paper sizes, RTL, Unicode, and pagination render correctly.
5. PDF and DOCX remain server-generated with existing account, consent, allowance, and Pro
   rules.
6. Master and job-specific resumes remain separate through save, refresh, conflict, and
   discard flows.
7. Match evidence and AI suggestions keep their explicit uncertainty and accept/reject
   controls.
8. Billing price, one-time/renewal choice, cancellation, and legal language are unchanged
   unless separately authorized.
9. Keyboard order, visible focus, modal isolation/restoration, skip link, and live status
   behavior remain correct.
10. No new horizontal overflow, focus obstruction, layout shift, or meaningful performance
    regression is introduced.

## Research signals used

- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md): semantic controls, focus, labels, content resilience, responsive interaction, motion, and state guidance.
- [WCAG 2.2](https://www.w3.org/TR/wcag/): the accessibility conformance baseline.
- [WCAG 2.2 target size](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/): minimum target sizing and spacing.
- [WCAG focus appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance): visible focus size and contrast.
- [WCAG focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum): persistent content must not hide keyboard focus.
- [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): keep frequent actions visible and defer secondary complexity with clear labels.
- [NN/g qualitative study sizing](https://www.nngroup.com/articles/how-many-test-users/): small iterative studies, with separate representation for meaningfully different user groups.
- [Teal Resume Builder](https://www.tealhq.com/tools/resume-builder): a current competitor pattern connecting editing, job matching, analysis, design, and multiple resume versions.
- [Kickresume editor guidance](https://www.kickresume.com/en/help-center/resume/): multiple clear starting paths—blank, assistance, import, or example.
- [Resume.io customization guidance](https://help.resume.io/en/articles/3784640): design controls and job-specific tailoring within the builder.
- [Canva resume builder](https://www.canva.com/resumes/): template breadth and direct manipulation as a contrasting template-marketplace model.
- [Web Vitals measurement](https://web.dev/articles/vitals-measurement-getting-started): LCP, CLS, and interaction measurement during implementation.

## Immediate next design task

Create a clickable, behavior-free prototype for two screens only:

1. the homepage hero plus three-stage product proof; and
2. the mobile builder header/context plus Edit/Preview control.

Use the existing brand tokens and real ResumeStride copy. Test those two screens before
redesigning the rest of the application. They carry the highest perception gain and the
largest mobile usability risk while touching the least product behavior.
