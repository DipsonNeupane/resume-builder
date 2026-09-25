# Parent integration update — September19
Components are now mounted behind disabled production feature flags. Added separate reviewed-draft preview/PDF export, server allowance display, response-time identity/source verification and privacy wording correction. Mocked browser suite6/6 passed. These do not establish hosted/live-provider behavior. Claude worker ended at usage limit; files reviewed independently.

# Paid UI review — generated-PDF controls and job-tailoring panel

Scope of this document/session: exactly the bounded frontend paid components
listed below. No other file was read for editing purposes beyond the ones
named in the task (HANDOFF.md, README.md, .github/copilot-instructions.md,
server/export/handler.ts, api/tailor.ts, server/ai/tailoring.ts, src/model.ts,
src/services/supabase.ts, plus src/hooks/useCloudResume.ts and
src/features/{auth,billing}/*.tsx and src/main.tsx/src/styles.css read
**read-only**, for existing patterns/CSS classes to reuse). `main.tsx`,
`styles.css`, any API route, `src/model.ts`, and `package.json` were **not
edited** — integrating these two components into the actual builder UI
(rendering them somewhere in `main.tsx`, deciding when they appear, wiring
`onSignIn`) is explicitly left to the parent session, per the task's own
"Parent integrates" instruction.

## Files added

- `src/features/export/GeneratedPdfControls.tsx`
- `src/features/tailoring/TailoringPanel.tsx`
- `src/features/tailoring/applySuggestion.ts`
- `tests/server/applySuggestion.test.ts`
- `docs/PAID_UI_REVIEW.md` (this file)

## `GeneratedPdfControls`

Props: `{ resume: Resume; ownerId: string | null; onSignIn: () => void }`.

- **Signed out** (`ownerId === null`): shows a `notice` explaining a
  generated PDF requires signing in, states the free allowance (3 generated
  PDFs per signup, renewing every 30 days) up front, and explicitly says
  browser Print / Save as PDF and JSON backups are unaffected and remain
  unlimited (per README/HANDOFF's existing accounting: only the server's
  `POST /api/export-pdf` — not printing, not JSON — is counted). Calls
  `onSignIn()` rather than navigating itself, since this component doesn't
  own routing.
- **Signed in**: requires an explicit upload-consent checkbox
  ("I consent to uploading my resume content to ResumeStride's server to
  generate this PDF") before the download button is enabled — this is a
  real upload (the full `resume` object, matching what
  `server/export/handler.ts`/`server/export/render.tsx` actually need to
  render it), so the consent text says exactly that rather than something
  vaguer.
- **No invented remaining-count**: deliberately shows only the static "3 per
  signup, renews every 30 days" policy text, never a live "X left" number —
  there is no status endpoint to read that from yet (`api/billing-status.ts`
  reports Pro/pass state, not PDF-specific remaining count). A future parent
  session adding a status field can extend this component's props rather
  than needing a rewrite.
- **Idempotent-retry request id**: `server/export/handler.ts`'s `pdf_begin`/
  `pdf_finish` pair is keyed by a client-supplied UUID (`requestId`) plus a
  server-computed content hash, and an already-completed request for the
  same id is `already_complete` (not re-debited). This component mirrors
  that contract on the client: it hashes-by-equality (`JSON.stringify`) the
  exact `resume` object about to be sent against the last one it actually
  sent, reusing the same UUID for a same-content retry and minting a new
  UUID (`crypto.randomUUID()`) the moment the content differs. The `resume`
  value sent is captured into a local `snapshot` at click time, so a user
  who keeps typing while the request is in flight still gets the resume
  exactly as it was when they clicked, not a half-edited version a moment
  later.
- **Duplicate-click guard**: a `useRef` boolean (`inFlight`), checked and set
  synchronously before any `await`, so two clicks dispatched in the same
  tick can't both start a request — the same pattern
  `src/hooks/useCloudResume.ts`'s `savingRef` already uses for cloud saves.
- **Abort on unmount/account change**: an `AbortController` is created per
  request and aborted both on unmount and whenever `ownerId` changes
  (`useEffect` keyed on `[ownerId]`); `consent`, any prior `message`, and the
  remembered request id are all reset on an account change too, so nothing
  from a previous account's session silently carries into the next one.
- **Session identity verified before AND after the async round trip**:
  before sending, it calls `supabase.auth.getSession()` and checks
  `session.user.id === ownerId`; after the PDF bytes are fully downloaded
  (and validated — see below) but **before** triggering the browser
  download, it re-checks the session identity again. If the signed-in
  account changed mid-request (sign-out, switch, or the tab's session
  otherwise changing), the just-downloaded bytes are discarded instead of
  being handed to whichever account is current now — this is the literal
  "no other account download" requirement, and it mirrors
  `BillingPanel.tsx`'s existing pre/post-checkout identity check pattern.
- **Content-type/size check + blob URL hygiene**: rejects a response whose
  `content-type` doesn't start with `application/pdf`, rejects a declared or
  actual byte size above a local `MAX_PDF_BYTES` (set just above
  `server/export/render.tsx`'s own 4,000,000-byte hard cap, so a legitimate
  file at that exact limit is never second-guessed for a different reason
  than the server already gave), and revokes the `URL.createObjectURL` blob
  URL via the same `setTimeout(...,1000)` pattern `src/main.tsx`'s existing
  `downloadBackup`/`downloadRescue` already use (so the anchor's click has
  time to actually start the download first).

## `TailoringPanel`

Props: same `{ resume, ownerId, onSignIn }` shape.

- **Signed out**: a `notice` + `onSignIn()`, matching `GeneratedPdfControls`.
- **Job description + explicit consent, no autosubmit**: a bounded
  (`maxLength`, 20,000 chars — well under `api/tailor.ts`'s 160,000-byte
  request cap once the resume itself is included) `textarea`, plus a
  required consent checkbox naming exactly what's sent and where: resume
  content and the job description go to ResumeStride's server, which "only"
  forwards headline/summary/skills/section entries to OpenAI — this is not
  a simplification, it's what `server/ai/tailoring.ts`'s own `toPayload()`
  actually does (its own comment: "Deliberately excludes name/email/phone/
  website/personal location"). The "Get tailoring suggestions" button is the
  only thing that ever sends a request; nothing fires on typing, blur, or a
  timer.
- **`POST /api/tailor`**: sends `{ resume, jobDescription, consent: true }`
  with a bearer token from the live Supabase session, verified
  (`session.user.id === ownerId`) immediately before sending, matching
  `GeneratedPdfControls`'s pre-request identity check. Note
  `api/tailor.ts` validates the full `resume` with `isResume()` (not the
  server's narrower `TailoringResume` shape) — so, correctly, this panel
  sends the whole `resume` prop, exactly as the app already has it, not a
  hand-trimmed subset; PII stripping happens server-side in `toPayload()`
  where it's actually enforced.
- **Plain, escaped before/after; accept/reject each**: every suggestion
  renders `originalText`/`suggestedText` as ordinary JSX text content (React
  escapes by default; no `dangerouslySetInnerHTML` anywhere in either new
  file), reusing the existing `pro-preview-compare` two-column CSS class
  already defined for `main.tsx`'s own before/after Pro preview. Each
  pending suggestion gets its own Accept/Reject buttons
  (`text-button`/`text-button danger`, both pre-existing classes); accepted
  or rejected suggestions show a short status line instead of the buttons.
- **Never mutates the original, never calls a parent setter**: there is no
  setter in this component's props by design. Accepting a suggestion calls
  the new pure `applySuggestion(draft, suggestion)` helper against a
  **separate, locally-owned `draft` resume** (cloned from `resume` the
  moment suggestions were fetched) and replaces `draft` with the result;
  `resume` itself is never written to. The only way to keep accepted changes
  is the explicit "Download draft as JSON backup" button, which downloads
  `draft` as a `.json` file using the same
  `URL.createObjectURL`/anchor-click/`revokeObjectURL` pattern as the
  existing backup download in `main.tsx` — i.e., the same recovery path a
  user already knows from the rest of the app (re-import via "Import JSON
  backup" is existing, unmodified behavior in `main.tsx`).
- **Race-safe account changes**: the same `AbortController` +
  `useEffect([ownerId])` reset pattern as `GeneratedPdfControls` — an
  account change aborts any in-flight `/api/tailor` request and clears job
  description, consent, messages, and the entire review (items + draft).
- **Reset-on-source-change, specifically to prevent stale application**: a
  second `useEffect` keyed on the live `resume` prop compares its current
  `JSON.stringify` against the signature captured at the moment suggestions
  were fetched (`sourceSignature`, a ref — not React state, so it doesn't
  itself trigger a render). If the resume changed (the user kept editing the
  real builder elsewhere while a tailoring review was open), the entire
  review — pending suggestions AND the draft — is cleared with an explicit
  notice, rather than leaving suggestions on screen that could be accepted
  against a `draft` that no longer reflects what "the resume" currently
  means. This is the literal requirement "on source prop change reset review
  to prevent stale source application."
- **A real concurrency bug found and fixed while building this, not just
  implemented blind**: the first draft of `accept()` wrapped the whole
  operation — including the side-effecting `setDraft(...)` call — inside the
  updater function passed to `setItems(current => { ...; setDraft(next);
  return ...})`. That's a nested-setState-inside-a-setState-updater, which
  is unsound: React's functional updaters are supposed to be pure and **can
  be invoked more than once** (React 18/19 Strict Mode double-invokes them
  specifically to catch this class of bug), which would have made
  `setDraft`/`draftRef` mutation fire twice per accept in development,
  silently double-applying or corrupting the draft. Fixed by keeping a
  `draftRef` (a plain ref, mirrored alongside `draft` state via a small
  `setDraftBoth` helper) as the single source of truth read synchronously by
  `accept()`, and by never calling a state setter from inside another
  setter's updater function — `setDraftBoth`/`setItems` are now always two
  separate, top-level calls in the event handler body, not nested. The
  actual double-click-safety property (two rapid Accept clicks on the same
  suggestion can't both succeed) still holds without a separate lock,
  because `applySuggestion`'s own strict `originalText` match against
  `draftRef.current` makes the second, now-stale attempt fail closed as an
  ordinary "no longer matches" rejection instead of double-applying.

## `applySuggestion` (pure helper)

`(source: Resume, suggestion: Suggestion) => Resume`, throwing
`InvalidSuggestionError` (never silently no-op-ing, never partially
applying) when any of the following hold:

- the suggestion is malformed, or `field` isn't one of the five known values
  (`headline`/`summary`/`skills`/`title`/`description`) — rejects attempts
  to name an arbitrary/prototype-polluting key such as `__proto__`;
- a top-level field (`headline`/`summary`/`skills`) carries a non-null
  `sectionId`/`entryId`, or an entry field (`title`/`description`) is
  missing one — the suggestion's shape must actually match its claimed
  target;
- `sectionId`/`entryId` don't name a section/entry that **actually exists in
  `source`** — critically, an `entryId` is looked up **only inside the named
  `sectionId`'s own `entries` array**, not across the whole document, so a
  suggestion can't be forged to apply to an entry that exists in a
  *different* section than the one it claims (covered by a dedicated test);
- `originalText` doesn't **exactly** match the current text at that target
  in `source` right now — this is what makes a stale suggestion (the user
  edited that field after the suggestion was generated, or it's being
  replayed against a resume it was never generated from) fail safely
  instead of silently overwriting newer content;
- `suggestedText` is blank/whitespace-only, unchanged from `originalText`,
  or exceeds a 1,000-character bound (restated locally as
  `MAX_SUGGESTED_CHARS`, mirroring — but not importing —
  `server/ai/tailoring.ts`'s own constant of the same value; that module is
  server-only and isn't imported into client code, see the file's own
  top-of-file comment);
- the result would fail `isResume()` or push `contentLength()` over the
  shared `maxContentChars` cap (both from `src/model.ts`, unmodified,
  reused as-is).

On success it returns a **brand-new** `Resume` object built with object/array
spreads — `source` itself is never mutated (verified by `structuredClone`
comparison in tests), and every section/entry not on the suggestion's exact
target path is preserved.

### Why this file duplicates `Suggestion`/`SuggestionField` instead of importing them

`server/ai/tailoring.ts` is a server-only module (it makes the actual OpenAI
request, handles budget reservation, etc.) and is not meant to be bundled
into the browser. `applySuggestion.ts` is imported directly by
`TailoringPanel.tsx`, which **is** client code, so it restates the same
`Suggestion`/`SuggestionField` shape and the `MAX_SUGGESTED_CHARS` bound by
hand rather than importing the server module. This is a real, named
maintenance obligation, not an oversight — if `server/ai/tailoring.ts`'s
`Suggestion` shape or bound ever changes, `applySuggestion.ts`'s copies need
a matching manual update. Documented in both files' top comments.

## Tests — `tests/server/applySuggestion.test.ts` (13 tests, via `npm run test:server`, Node's built-in test runner)

Covers, per the task's explicit list:
- **Immutability**: applying a valid top-level suggestion and a valid
  entry-level suggestion each leave `source` byte-for-byte unchanged
  (`structuredClone` snapshot compared with `assert.deepEqual` after the
  call), and unaffected sections/entries in the result are unchanged from
  the source.
- **Staleness**: a suggestion whose `originalText` no longer matches the
  live resume (top-level and entry-level cases) is rejected.
- **Malicious/forged fields**: an `entryId` that only exists in a different
  section is rejected; an unknown field name (including `__proto__`) is
  rejected; a top-level field carrying a stray `sectionId`/`entryId` is
  rejected; an entry field missing its `sectionId`/`entryId` is rejected; a
  suggestion pointing at ids that don't exist anywhere is rejected;
  malformed shapes (arrays/objects standing in for strings, `null`
  `originalText`/`suggestedText`, etc. — including an object with a
  `toString` override, ruling out coercion-based bypasses) are all rejected.
- **Bounds**: blank/whitespace-only, unchanged, and over-1,000-character
  suggested text are all rejected; exactly 1,000 characters is accepted.
- **Global content**: a suggestion over resume text mixing Devanagari,
  Arabic, and Japanese script is applied exactly, and a Unicode
  NFD-normalized (visually similar but byte-different) variant of that same
  text is correctly rejected as not an exact match — matching this app's
  worldwide, all-script audience and this function's exact-string-match
  contract.
- **Size cap**: builds a resume filled close to the shared 200,000-character
  `maxContentChars` limit (three separate fields each right at their own
  50,000-character per-field cap, so no single field ever exceeds
  `isResume`'s own bound) with exactly 10 characters of headroom, confirms a
  suggestion that would add more than 10 characters is rejected, and that
  one adding exactly 1 character still succeeds.

## Verification actually run this session

- `npm run test:server` — **54/54 pass** (41 pre-existing + 13 new in
  `applySuggestion.test.ts`; full transcript read, not just the summary
  line). The size-cap test initially failed on first write
  (`25 !== 10` headroom) because the fixture reused `example()`'s
  pre-filled `organization` field instead of starting from an empty one,
  throwing off the exact-headroom arithmetic — fixed by explicitly clearing
  that field before computing the target headroom, not by loosening the
  assertion.
- `npm run check:server` (`tsc -p tsconfig.server.json`) — passes with no
  errors. `applySuggestion.ts`/its test are picked up as transitive imports
  of files under `tests/server`, the same way `tests/server/export.test.ts`
  already imports `src/model.ts` without `src` being in that config's own
  `include` list.
- `npx tsc --noEmit` (the main app's own strict check, `tsconfig.json`,
  which includes `src`) — passes with no errors, confirming both new
  `.tsx` components type-check cleanly against `src/model.ts`'s `Resume`
  type and `src/services/supabase.ts`'s `supabase` client.
- `npm run build`/`npm test` (the full Playwright suite) were **not** run
  this session: neither new component is wired into `main.tsx` yet (out of
  this session's ownership — "Parent integrates"), so there is nothing new
  for the existing browser test suite to exercise, and running it would
  only re-confirm the pre-existing suite is unaffected by files it never
  imports. The parent session should re-run the full suite once these are
  actually mounted somewhere in the UI.

## Known limitations, honestly stated

- **Not integrated.** Neither component is imported or rendered anywhere in
  `main.tsx`. There is currently no UI path a real user can reach that
  shows either of them. This review makes no claim that generated-PDF
  downloads or AI tailoring are live in the app today.
- **No live API calls were made.** Nothing in this session called the real
  `/api/export-pdf` or `/api/tailor` endpoints, OpenAI, Stripe, or Supabase;
  no secrets were read or used. Both endpoints are gated server-side behind
  `EXPORTS_ENABLED`/`AI_ENABLED` (currently unset/false per
  `docs/PAID_BACKEND_RELEASE.md`), so even once mounted in the UI, both
  components' "signed in" branches would currently receive the server's own
  honest 503 ("...not available yet") on every attempt — surfaced through
  each component's existing error-message path, not specially handled.
- **No browser/E2E test of either component.** The 13 new tests are Node
  unit tests of the pure `applySuggestion` helper only; nothing here
  exercises the two React components in a real or simulated browser (no
  Playwright test was added, since there is no mounted UI yet to point one
  at). The parent session integrating these should add that coverage once
  they're wired in.
- **No remaining-PDF-count display**, by design — see "No invented
  remaining-count" above. A parent adding a status endpoint should extend
  `GeneratedPdfControls`'s props rather than having it call one directly, to
  keep this component's own scope (upload/consent/download) unchanged.
- **`TailoringPanel`'s job-description bound (20,000 chars) is a local UI
  choice**, not derived from a named server constant (the server bounds the
  whole request body at 160,000 bytes in `api/tailor.ts`, not the job
  description specifically) — generous enough for any real job posting
  while leaving headroom under the server's total request cap once the full
  resume JSON is included.
- **Neither component reads or displays Pro-entitlement status.** Both
  simply attempt their request and surface whatever the server says back
  (e.g. `api/tailor.ts`'s 402 "AI tailoring requires an active Pro pass");
  neither claims Pro access is available for purchase, matching this
  codebase's existing "explain gated capability, never fake a status" style
  (`BillingPanel.tsx`, `main.tsx`'s existing Pro preview).
