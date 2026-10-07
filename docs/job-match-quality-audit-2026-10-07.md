# Job search and Match quality correction — 2026-10-07

## Production failure and systemic causes

The Free search treated its five-result allowance as a de facto quota: every provider
candidate surviving location/employment/salary filters was ranked and returned, even
when it had no occupational relationship to the resume or requested role. The title
relationship heuristic then treated any shared non-title token as direct relation;
`full` in `Java Full StackDeveloper` and `Keyholder Full Time` was enough. Requirement
classification used broad occurrences of `required` and `essential`, so headings,
markdown residue and ordinary duties became qualifications. Evidence tokenization
retained common wording and accepted low overlap ratios, allowing generic words to look
like evidence.

## Corrected policy

- Normalize imported/query titles, including obvious camel-case boundaries.
- Assess a candidate using concrete title terms, bounded occupation-family signals and
  substantive resume skills. Search intent can establish candidate eligibility, but it
  cannot create resume evidence or a direct-title claim.
- Reject candidates without a defensible relationship before diversity and the account
  result ceiling. Five and twenty remain maxima, not fill targets.
- Emit `relates directly` only from a resume title with the same concrete title term or
  occupational family. Generic title words and employment wording never qualify.
- Treat responsibility headings as responsibility context; strip markdown residue;
  keep heading-only lines out of requirements; classify duties only when they contain a
  real explicit qualification/credential/experience constraint.
- Exclude stopwords and generic qualification wording from evidence. Multi-concept
  requirements require substantive overlap. Security-clearance requirements require
  explicit clearance wording; `security` alone is insufficient.
- Show seniority observations only after an occupational relationship exists.
- Preserve `not demonstrated` as unknown and reserve incompatibility for explicit user
  clarification.
- Bump deterministic Match analysis to version 2 and invalidate older saved analyses so
  false version-1 claims cannot survive through persistence.

## Regression evidence

The targeted suite contains six new regression groups with 23 explicit input cases:

- two relevant Java/software candidates retained;
- Keyholder, facilities Maintenance Tech and Sous Chef rejected;
- three unrelated roles forbidden from direct-title and seniority claims;
- four heading/duty extraction failures reduced to one real electrician-license
  qualification;
- weak/common security wording rejected while explicit clearance evidence is retained;
- ten healthcare, education, operations, creative, trades and domain/function-conflict
  positive/negative occupation pairs.

Focused server regression: 69/69 passed. Database migration/policy suite passed,
including the updated versioned Match persistence assertions. The complete release gate
is recorded in the final commit evidence; no provider, production, pricing, allowance,
UI or deployment change is part of this branch.
