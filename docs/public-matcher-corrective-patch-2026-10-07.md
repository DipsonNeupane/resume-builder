# Public matcher corrective patch — 2026-10-07

## Scope and production finding

Production commit `17c9c6b` corrected the authenticated saved-job Match path in
`server/jobs/match.ts`, but the anonymous matcher at
`/tools/resume-job-match/` runs a separate, browser-only analyzer from
`src/tools/analysis.ts` (generated as `public/tools/analysis.js`). Production
reproduction confirmed that this second path retained the earlier permissive
heading, classification, and lexical-overlap behavior.

## Correction

- Public and authenticated analyzers now recognize and discard/reset on the
  reported heading forms, including markdown-wrapped headings and the generic
  `Qualifications` boundary.
- Public required classification uses bounded qualification markers instead of
  treating any sentence containing words such as `required` or `essential` as
  a qualification. Responsibilities may remain visible as **Other signals**;
  they are not promoted to required qualifications.
- Public evidence requires substantive multi-token overlap (or a single
  specific one-token signal) and has an explicit security-clearance boundary.
  Generic application-security wording cannot demonstrate a clearance.
- The generated public browser module is committed with its source so the
  deployed artifact cannot retain the stale implementation.

## Regression evidence

The exact reported structures are permanent fixtures in both analyzers:

- `ESSENTIAL FUNCTIONS/DUTIES`, `Essential Duties and Responsibilities`,
  `Required:` and `Qualifications` do not become requirements.
- `Notifies supervisor if major repairs are required` and `Serve customers and
  operate register` are not required qualifications.
- Application-security text does not support `Security clearance required`;
  an explicitly stated active Secret clearance does.
- The authenticated Java/retail/facilities/culinary relevance and cross-family
  occupation fixtures from `17c9c6b` remain in the release gate.

Focused deterministic matcher tests pass 34/34. The public tool suite passes
18/18 (nine analysis tests and nine rendered Chromium tests, including the exact
production fixture). The complete server suite passes 457/457 and the full
release gate passes all 13 checks, including the production build, type checks,
SEO, performance budgets, accessibility, navigation, ownership isolation,
export smoke tests and built-artifact verification. The code graph also rebuilt
successfully (3,410 nodes / 7,091 edges / 229 communities).

## Provider and rollback decision

The real Free provider refresh remains unavailable until the legitimate account
allowance resets. No quota, customer allowance, or provider configuration was
changed or bypassed. Mocked provider coverage is supporting evidence only; real
provider relevance therefore remains **PENDING**.

Rolling back from `17c9c6b` is not recommended: the previous deployment contains
the same public matcher defect and would also remove the authenticated search and
Match corrections. The safe path is this bounded, tested corrective patch, held
for explicit deployment authorization.
