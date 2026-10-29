# Redesign isolation record

Date: 2026-09-29
Production source commit: `16e03e33dd41ae3bfa7f00fea70b191515759055`

## Guardrail

Production remains live and is the redesign control. Redesign work must not be merged to `master`, deployed with a production flag, promoted in Vercel, or advertised on public production pages without a separate owner-approved release plan.

## Repository and deployment facts

- GitHub repository: `DipsonNeupane/resume-builder`; default and Vercel production branch: `master`.
- Current production deployment: `dpl_9FFi7Wzw99Tm5BFisx7abZbSuJhH`, Ready and aliased to `resumestride.com`, `www.resumestride.com`, and `resumestride.vercel.app`.
- Vercel creates preview deployments for non-production branches. A preview is not permission to promote it.
- GitHub currently exposes no branch protection, ruleset, required review, required status check, or Actions workflow. A push to `master` is therefore production-sensitive.
- The original checkout at `/Users/dipson/ResumeStride` contains extensive owner work. It must not be cleaned, stashed, switched, rebased, or used for redesign commits.

## Isolated branch model

- `redesign/integration`: integration reference based on the exact production commit above.
- `redesign/g1-strategy-measurement`: active Group 1 work branch based on `redesign/integration`.
- Later scoped branches should start from the latest reviewed `redesign/integration`, use `redesign/g<group>-<scope>`, and return through reviewable commits.
- Only tested, reviewed scoped work is integrated into `redesign/integration`.
- Nothing flows from `redesign/integration` to `master` without explicit owner approval.

## Required release gate for any later production proposal

1. Resolve dirty/unrelated owner work without deleting it.
2. Review the complete redesign diff against `master`.
3. Run the repository's build, client/server type checks, relevant Playwright suites, server/billing tests, SEO checks, accessibility workflows, and PDF/DOCX smoke tests.
4. Verify public claims against the production candidate, not local source or submitted extension versions.
5. Review database migrations, feature flags, analytics/privacy changes, billing text, and rollback steps.
6. Obtain explicit owner approval for the release plan and production action.

## Recommended owner hardening before release work

- Protect `master` and require pull-request review plus passing checks.
- Add a CI workflow for the repeatable quality gate.
- Document who may promote a preview and how rollback is performed.
