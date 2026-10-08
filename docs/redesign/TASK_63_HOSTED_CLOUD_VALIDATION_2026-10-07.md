# Task 63 hosted cloud-saving validation — 2026-10-07

## Decision

Task 63 remains **VALIDATION PENDING**. Every non-destructive hosted behavior in the
blueprint boundary passed against the production Supabase project with dedicated fictional
accounts, but the populated provider-backup restore drill required by the established cloud
acceptance plan has not been executed. Cloud saving remains disabled in the public APWICO
build. No customer document, entitlement, provider setting or production schema was changed.

## Hosted evidence

Two newly confirmed, owner-authorized test identities with empty document stores were used.
Tokens, passwords, email links and row identifiers were kept out of repository evidence.
The guarded check in `scripts/validate-task63-cloud.mjs` is pinned to production project
`ggwwzwqykkncgupdimxp`, accepts only two distinct authenticated user sessions, rejects an
unexpected origin and never uses the service role.

The final direct hosted run passed **14/14**:

- empty-account precondition;
- forged-owner insert rejected by RLS;
- first cloud save and fresh-session recovery;
- second-account and signed-out reads denied;
- second account can save only its own document;
- account switching returns only the active owner's row;
- first concurrent update wins and a stale revision cannot overwrite it;
- an aborted write leaves the stored revision intact and a later retry persists;
- another owner cannot delete the document;
- owner deletion removes the master and its retained revisions; and
- all fixtures created by the run are removed and re-read as absent.

A separate real-browser exercise used three isolated browser contexts and the current cloud
hook/service code against the same hosted project. It passed **8/8**: explicit-consent save,
browser-draft separation, fresh-context recovery, both-device conflict handling, simulated
network interruption with visible retry and persisted recovery, second-account save,
same-tab account switching without cross-owner content, and retention of the browser-only
guest draft. A subsequent fresh-session read confirmed both test accounts had zero resume
rows after cleanup; retained revision rows were also zero.

## Provider and security evidence

The Supabase dashboard was inspected read-only while authenticated. Production has the four
owner-scoped `resumes` SELECT/INSERT/UPDATE/DELETE policies and the owner-scoped
`resume_revisions` SELECT policy. The hosted negative tests independently prove that the
effective grants/RLS boundary rejects anonymous access, forged ownership, cross-owner reads
and cross-owner deletes.

Scheduled physical database backups exist daily around midnight in the project region. The
dashboard displayed seven current daily backups and an available non-destructive **Restore
to new project** path. Storage-object exclusion is documented by the provider and does not
affect Task 63 resume rows, which are database records rather than Storage API objects.

Existence of backups and a recovery path is not substituted for a populated restore drill.
The established `PRODUCTION_CLOUD_ACCEPTANCE.md` exit gate requires a fictional populated
backup to be restored into an isolated project, ownership/content hashes verified, and
measured recovery objectives recorded before cloud saving is promoted. Performing that
provider operation now could create billable infrastructure and has not been authorized as
part of this non-destructive validation.

## Criterion result

| Blueprint boundary | Result |
| --- | --- |
| Explicit consent and local/cloud separation | PASS |
| Hosted save and fresh-session recovery | PASS |
| Two-account ownership and account switching | PASS |
| Optimistic revision conflict behavior | PASS |
| Interrupted save, retry and recovery | PASS |
| Owner deletion and no reappearance | PASS |
| Limits and permanent-failure handling | PASS — existing isolated/database and browser evidence retained |
| Supabase policies and effective server access | PASS |
| Provider backup schedule and recovery route | PASS |
| Populated restore into an isolated hosted project | VALIDATION PENDING |

## Production impact

No public feature flag, schema, RLS policy, provider configuration or customer data changed.
All fictional document fixtures and revisions were deleted. Two empty authorized test
identities remain for repeatable hosted acceptance; they contain no resume rows. Temporary
credentials and downloaded environment material were removed from the workstation after the
run.
