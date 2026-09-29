# Shared route and state architecture

Status date: 2026-09-29. This contract is the common foundation for Groups 2, 3 and 6. It applies only to the isolated redesign branch.

## Boundaries

- Public discovery pages receive a permanent URL only when the build produces meaningful, crawlable HTML for that URL. Until then, existing homepage anchors remain the truthful destination.
- Private application states use typed `/start/*` and `/workspace/*` routes. They are always `noindex, nofollow, noarchive` and `private, no-store` at the HTTP boundary.
- Resume text, job text, URLs, auth secrets and other user content never enter navigation metadata.
- Object routes accept only UUID-shaped saved-job or version identifiers. The identifier selects an owner-scoped server record; it is not authorization.
- Missing, invalid or no-longer-owned objects must resolve to a useful workspace fallback, never another owner's data.

## Route contract

| Route | Purpose | Current delivery boundary |
| --- | --- | --- |
| `/` | Public homepage | Complete existing public entry |
| `/start/import` | Import-first onboarding | Reserved and routed to the resume workspace; journey UI remains G3 work |
| `/start/build` | Build-first onboarding | Reserved and routed to the resume workspace; journey UI remains G3 work |
| `/start/job` | Job-first onboarding | Reserved and routed to Jobs; capture-first UI remains G3 work |
| `/start/sample` | Fictional sample | Reserved and routed to Jobs; guided sample remains G3 work |
| `/workspace/resume` | Master resume workspace | Stable, reloadable private entry |
| `/workspace/jobs` | Jobs and recommendations | Stable, reloadable private entry |
| `/workspace/jobs/saved` | Saved jobs | Typed route; dedicated state selection remains G3/G5 work |
| `/workspace/jobs/:savedJobId/match` | Match Analysis | Strict identifier route; owner-scoped object restoration remains G3/G5 work |
| `/workspace/resumes/:versionId` | Job-specific resume | Strict identifier route; owner-scoped object restoration remains G3/G5 work |
| `/workspace/account` | Account access | Stable private entry and auth-return boundary |
| `/workspace/pro` | Product access and purchase | Stable private product state; public pricing remains `/#pricing` until static pricing HTML exists |

Legacy `?builder=1`, `?jobs=1`, `?pro=1` and authentication callbacks remain readable during migration. New in-app navigation writes the typed paths.

## Navigation and continuation rules

- Meaningful screen changes create browser history entries. Minor editor tabs, template selection and modal state do not.
- `popstate` restores the corresponding safe screen without overwriting document state.
- Sign-in continuation is a single-use session record containing only a validated private path, an optional owner identifier, a version and a timestamp.
- Guest continuation can be claimed by the account that completes sign-in in that browser session. A continuation already scoped to one owner is discarded for every other owner.
- Continuations expire after 30 minutes and are removed whether accepted or rejected.
- Sensitive callback parameters remain available to the auth client until it consumes them; they are never copied into the continuation record.

## Shared state ownership

| State | Owner and persistence |
| --- | --- |
| Route/screen | Browser history; content-free |
| Anonymous master draft | Current browser session |
| Account master resume | Authenticated owner record |
| Saved job and Match | Authenticated owner record |
| Job-specific resume | Authenticated owner record, separate from the master |
| Import/job-first work in progress | Local, explicitly disclosed; never silently reassigned across accounts |
| Sign-in intent | Current browser session, bounded and single-use |

## Parallel implementation seams

- G2 may change homepage hierarchy, real public links and primary navigation against the typed route helpers.
- G3 may implement journey-specific screens and workspace object restoration without inventing new URL shapes.
- G6 may extend route policy, quality gates and static public rendering without importing private user state into public pages.
- Template detail URLs stay coordinated with G6 and are not exposed until their static, unique pages exist.
