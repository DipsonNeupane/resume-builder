# Tasks 19–22 real-world validation — 2026-10-05

Scope: live APWICO production validation plus isolated-branch corrections directly
required by the observed results. No production deployment or provider mutation was
performed.

## Result

| Task | Status | Real-world evidence | Remaining boundary |
| --- | --- | --- | --- |
| 19. Browser navigation | COMPLETE | Live desktop Back/Forward and reload restored the public matcher, master workspace and jobs workspace without a history trap or content-bearing URL. The owner then passed the same public/workspace Back/Forward sequence in a physical mobile browser. | None for the Done When boundary. |
| 20. Sign-in/recovery context | VALIDATION PENDING | A real production reset request delivered through the configured provider; the message opened APWICO in a genuinely new Chrome tab, established the recovery session and presented the new-password form. Mismatched-password validation focused the correct field and exposed an alert relationship. | The consumed one-time authorization code remained in the address bar until password completion, and the email sender display name remained ResumeStride. The code-cleanup defect is fixed and tested only on the isolated branch; provider identity and production revalidation remain. |
| 21. Document/storage concepts | VALIDATION PENDING | The owner was asked, without coaching, what document they believed they were editing on a physical phone. They could not determine it because the active-document name, explanation and storage scope visibly overlapped. | The responsive identity layout is fixed and tested only on the isolated branch. Normal-person comprehension must be repeated after deployment. |
| 22. Responsive/accessibility workflow | VALIDATION PENDING | Existing axe, keyboard, focus, zoom, narrow-screen and reduced-motion evidence remains valid. Live recovery validation confirmed a visible keyboard focus target plus `role=alert`, `aria-invalid` and `aria-describedby` on the correct field. Physical mobile review exposed the active-document overlap. | The local responsive fix passes 320/390/768/1440/1920 checks and axe, but production physical revalidation and one real screen-reader pass remain. |

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

Deploy the bounded code corrections through the normal tested release process, update
the production auth sender display name to APWICO, repeat the plain-language document
and storage questions on a phone, and complete one real VoiceOver/TalkBack/NVDA critical
path. No new product design or feature work is required.
