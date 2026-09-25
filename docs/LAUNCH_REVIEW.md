# Launch readiness — 2026-09-18

Reviewed local checkout at 44e8a38 before the delegated P0-02 increment. Source/package inventory and current UI copy were inspected. This is not a review of a deployed website; no live provider account, domain routing, mailbox delivery, or payment configuration was verified.

## Assessment

The core resume editor is a working beta. The requested Free/Pro product is not ready to launch as a paid service: authentication, trusted download accounting, payments, entitlement state, application storage and the advertised Pro AI toolkit are absent from this checkout. Current UI accurately presents a free local beta with browser printing; it still says no signup and unlimited printing. Change that copy only alongside working replacement flows.

## Immediate work

Claude CLI has been assigned only P0-02 in docs/CLAUDE_IMPLEMENTATION_TODO.md: language persistence, aggregate backup bounds, mobile recovery controls, and occupied rescue-slot preservation. Inspect its diff and run verification before marking the increment accepted. No deployment, billing, or AI implementation was requested in this increment.

## Remaining launch gates

1. Signup/sign-in for both tiers with preservation of existing local drafts; reliable owned storage and account isolation.
2. Reliable generated PDFs and server-enforced 3-download windows, every 30 days from signup; clarify whether browser print is outside accounting before publishing limits.
3. One-time $19.99 pass purchase, verified payment grants, early extension/expired repurchase, content retained on expiry.
4. Optional recurring payment explicitly chosen by users, default off; cancellation and prepaid-time reconciliation tested.
5. Master-preserving job applications, grounded tailoring, keyword/ATS guidance and matching cover letters, with controlled AI cost.
6. Factual privacy/terms and support, production configuration, recovery and end-to-end verification.

Use the existing detailed TODO for task dependencies and acceptance criteria. Preserve all completed builder work. A scoped free beta and the full paid launch are different milestones; do not sell unavailable capabilities.

## Delegation status

Claude was launched via the authenticated local CLI in print mode with acceptEdits and a scoped tool allowlist (no permission bypass). The active execution session for this Codex conversation is 35769. At the time of this note the process was running and had not returned a final report; no source changes or successful tests from this increment have been verified yet. Do not start a duplicate P0-02 implementation while it is active. After completion, inspect Git diff and test results before marking tasks done. The first invocation exited for missing prompt input; the corrected stdin invocation is the active one.

## Scheduled completion review — 2026-09-18

Claude execution session 35769 exited successfully. Its report says build and 18/18 tests passed; these were not independently rerun during this progress check. Changes remain uncommitted. No additional Claude job was started.

Quick source review identified two unresolved correctness issues, so P0-02 is not yet fully accepted:
- Oversized legacy backup import calls the growth-limited `update(data)`. When importing into a smaller draft, that update can reject the data, but import still displays “Backup imported.” A separate validated restore path or explicit update result is needed, with a regression for importing a valid >200,000-character backup.
- A second unreadable draft is retained only in memory when the rescue slot is occupied. Editing autosaves over the active raw copy; refreshing then loses the second recovery draft. Persist both recoveries or block overwriting the active raw copy until explicit resolution, and test edit/save/reload.

The one-time progress automation was paused after this check. Review/fix these issues before accepting the increment; preserve the working language and mobile changes.


## Follow-up fixes verified — 2026-09-18

The two findings from the scheduled review below are now fixed in src/main.tsx and covered by two new Playwright regressions. Validated JSON restore has a dedicated state replacement path, so a >200,000-character legacy backup imports into a smaller draft and persists without the editor growth limit falsely rejecting it. Import resets the active editor tab and language input. Existing field validation and 8 MB import limit remain in force; unlimited legacy file recovery is not claimed.

When the rescue slot is occupied by another unreadable draft, autosave AND pagehide writes pause while the second raw draft remains in the active storage key. The UI explains that new edits are in memory and must be backed up before refresh. Explicitly discarding the additional recovery requires confirmation and resumes persistence. Downloading a recovery does not silently authorize deleting it. Regression checks cover edit/reload survival of both originals and explicit replacement after confirmation.

Verification run here: npm run build passed; npm test passed 20/20; git diff --check passed. No deployment, commit, payment, AI, auth integration or new Claude job this session. Source changes remain local. Existing weaker PDF/accessibility assertions and provider-specific production checks are not resolved by these tests.

Next: P0-03 metadata and P0-04 authentication foundation. Questions sent to owner: confirm proposed Supabase provider and whether the free allowance counts generated PDFs only (with browser printing/JSON backups outside accounting). Those answers are pending. Do not duplicate completed fixes or interpret earlier historical review findings as still open.
