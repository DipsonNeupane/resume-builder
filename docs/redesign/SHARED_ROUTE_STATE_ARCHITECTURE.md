# Shared route and state architecture

Status date: 2026-09-29. This contract is the common foundation for Groups 2, 3 and 6. It applies only to the isolated redesign branch.

## Boundaries

- Public discovery pages receive a permanent URL only when the build produces meaningful, crawlable HTML for that URL. Templates and pricing now meet that rule.
- Private application states use typed `/start/*` and `/workspace/*` routes. They are always `noindex, nofollow, noarchive` and `private, no-store` at the HTTP boundary.
- Resume text, job text, URLs, auth secrets and other user content never enter navigation metadata.
- Object routes accept only UUID-shaped saved-job or version identifiers. The identifier selects an owner-scoped server record; it is not authorization.
- Missing, invalid or no-longer-owned objects must resolve to a useful workspace fallback, never another owner's data.
- Missing, deleted and unauthorized references deliberately share one content-free unavailable state. Load failures use a distinct content-free retry state without claiming the object exists.

## Route contract

| Route | Purpose | Current delivery boundary |
| --- | --- | --- |
| `/` | Public homepage | Complete existing public entry |
| `/templates/` | Public template gallery | Registry-backed static HTML, filters and curated showcase |
| `/templates/:templateId/` | Public template detail | Registry allowlist only; verified metadata and preview transition |
| `/pricing/` | Public access comparison | Verified Free, individual Premium and Pro boundaries; checkout remains separate |
| `/start/import` | Import-first onboarding | Truthful local parsing/review guidance and shared resume workspace |
| `/start/build` | Build-first onboarding | Essentials-first guidance and shared resume workspace |
| `/start/job` | Job-first onboarding | Job-context guidance and shared opportunity workspace |
| `/start/sample` | Fictional sample | Account-free, storage-free evidence-to-separate-version walkthrough |
| `/workspace/resume` | Master resume workspace | Stable, reloadable private entry |
| `/workspace/jobs` | Jobs and recommendations | Stable, reloadable private entry |
| `/workspace/jobs/saved` | Saved jobs | Stable saved-only state backed by the authenticated owner's list |
| `/workspace/jobs/:savedJobId/match` | Match Analysis | Strict UUID; restores only from the authenticated owner's saved-job snapshot |
| `/workspace/resumes/:versionId` | Job-specific resume | Strict UUID; waits for the owner master, then restores the separate version without replacing it |
| `/workspace/account` | Account access | Stable private entry and auth-return boundary |
| `/workspace/pro` | Product access and purchase | Stable private purchase state; cancellation returns here without implying a completed purchase |

Legacy `?builder=1`, `?jobs=1`, `?pro=1` and authentication callbacks remain readable during migration. New in-app navigation writes the typed paths.

## Navigation and continuation rules

- Meaningful screen changes create browser history entries. Minor editor tabs, template selection and modal state do not.
- `popstate` restores the corresponding safe screen without overwriting document state.
- Search criteria, editor tabs, template selection, dialogs and other minor presentation state remain component state and do not create history entries.
- Sign-in continuation is a single-use session record containing only a validated private path, an optional owner identifier, a version and a timestamp.
- Guest continuation can be claimed by the account that completes sign-in in that browser session. A continuation already scoped to one owner is discarded for every other owner.
- Continuations expire after 30 minutes and are removed whether accepted or rejected.
- Sensitive callback parameters remain available to the auth client until it consumes them; they are never copied into the continuation record.
- Confirmation and recovery emails may carry only a bounded `return_to` enum. Saved-object identifiers are deliberately downgraded to their parent workspace for new-tab return; arbitrary paths and user content are rejected.
- A browser-local job draft never replaces or blocks a requested saved-object URL. In-app navigation sets it aside intact, restores the master in memory and exposes an explicit “Resume local job draft” action; initial object deep links leave the stored draft untouched for the same explicit return.
- Account-backed object restoration waits until master-resume synchronization, consent/conflict and rescue state have settled. This prevents a guest or blank draft from becoming the protected master snapshot.

## Shared state ownership

| State | Owner and persistence |
| --- | --- |
| Route/screen | Browser history; content-free |
| Anonymous master draft | Current browser session |
| Account master resume | Authenticated owner record |
| Saved job and Match | Authenticated owner record |
| Job-specific resume | Authenticated owner record, separate from the master |
| Import/job-first work in progress | Versioned, expiring session object; a guest object may be claimed once, while owner-bound content is deleted on account switch |
| Sign-in intent | Current browser session, bounded and single-use |

## Parallel implementation seams

- G2 may change homepage hierarchy, real public links and primary navigation against the typed route helpers.
- G3 may implement journey-specific screens and workspace object restoration without inventing new URL shapes.
- G6 may extend route policy, quality gates and static public rendering without importing private user state into public pages.
- Template detail URLs are now generated from the shared registry and covered by G6 canonical, sitemap, accessibility, overflow and performance checks. This is URL architecture for later G7 use, not bulk G7 content.
