# Tasks 19–22 real-world validation — 2026-10-05

Scope: live APWICO production validation plus isolated-branch corrections directly
required by the observed results. The original 2026-10-05 session performed no production
deployment or provider mutation; the 2026-10-07 closure below records the subsequently
authorized deployment, SMTP sender correction and physical human validation.

## Result

| Task | Status | Real-world evidence | Remaining boundary |
| --- | --- | --- | --- |
| 19. Browser navigation | COMPLETE | Live desktop Back/Forward and reload restored the public matcher, master workspace and jobs workspace without a history trap or content-bearing URL. The owner then passed the same public/workspace Back/Forward sequence in a physical mobile browser. | None for the Done When boundary. |
| 20. Sign-in/recovery context | COMPLETE | A fresh production reset email displayed APWICO, opened the new-password flow in a real new tab and left no consumed `code` in the address bar. Supabase SMTP sender name was changed from ResumeStride to APWICO and verified after reload. Existing continuation/account-switch isolation evidence remains green. | None. |
| 21. Document/storage concepts | COMPLETE | After deployment, the owner identified the active master and local browser-session storage without coaching on a physical iPhone. The isolated fictional sample then made clear that the job-specific version is separate and its master remains unchanged. | None. |
| 22. Responsive/accessibility workflow | COMPLETE | Existing axe, keyboard, focus, error/status, zoom, narrow-screen and reduced-motion evidence remains valid. The owner passed the corrected layout on a physical iPhone and used real VoiceOver to traverse the active-document state and primary editing controls in usable order without a trap. | None. |

Human validation outcome: **FAIL overall**. Task 19 passed; the Task 21 answer
identified a real mobile layout failure, so the session stopped before asking the
owner to spend time on screen-reader validation against a known-defective surface.

## Issues discovered

1. At phone width, the active-document explanation/storage scope occupied the same
   grid row as the document identity and visually overlapped it.
2. After the real PKCE recovery exchange succeeded, the consumed authorization code
   remained visible in the address bar while the new-password form was open.
3. The production recovery email sender display name still used ResumeStride.

Issues 1 and 2 are corrected on the isolated branch. Issue 3 is a production-provider
identity correction and was deliberately not changed during this validation session.

## Isolated-branch corrections and verification

- Mobile active-document identity now uses one clear vertical flow and retains visible
  master/job-version and local/account scope wording.
- Once a recovery session is established, the authorization code is removed with
  `history.replaceState`; the bounded `reset=1` state remains until password completion.
- Recovery request/update/code-cleanup browser checks: **3/3 PASS**.
- Responsive public/document workspace matrix at 320/390/768/1440/1920, including axe
  and a non-overlap geometry assertion at phone widths: **5/5 PASS**.
- The final 320px rendered capture was inspected and the document identity is readable,
  separated and ordered.
- A full TypeScript rerun was attempted but the synchronized workspace repeatedly
  blocked on cold placeholder reads; it was stopped without a compiler result. The
  focused browser suites compile and execute the changed TypeScript successfully.

## Closure path

Completed 2026-10-07. The bounded code corrections are live through the current APWICO
production release; the SMTP sender name reloads as APWICO; the real recovery, physical
document/storage comprehension and VoiceOver checks all pass. The three issues above are
resolved with no Chrome extension, international-payment, design, copy or unrelated
product change.
