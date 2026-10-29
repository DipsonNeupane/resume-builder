# Extension 0.2.5 major-board capture evidence

Status: submitted to the Chrome Web Store on 2026-10-13; Google review pending. Automatic publication after approval is enabled. Task 37 remains Validation Pending until public version 0.2.5 is approved and verified.

## Supported capture paths

- LinkedIn: compact paste/review fallback with the canonical active-tab job URL. APWICO does not read LinkedIn page content because LinkedIn's published rules prohibit scraping browser extensions.
- Indeed: compact paste/review fallback with the canonical active-tab job URL. APWICO does not read Indeed page content without written permission because Indeed's Terms prohibit scraping/extracting Site data.
- Greenhouse and Lever: exact public job-detail URL patterns. Greenhouse uses its public board response and corroborates the requested job ID.
- Workday and other public boards: a single, URL-correlated `JobPosting` record when unambiguous. If structured data is absent or ambiguous, APWICO offers explicit selected-text capture or a compact paste/review path.

Workday remains partial because its tenant-specific implementations do not expose one consistently reliable public detail contract. The extension does not claim automatic capture when it cannot establish the active job.

## Safety and data quality

- Capture happens only after the toolbar action.
- No broad job-board host permission was added; `activeTab` remains the capture boundary.
- Canonical URLs retain LinkedIn/Indeed public job identity while dropping tracking state; restricted-board page content is never read.
- Original source URL and extracted fields are retained; unknown fields stay unknown.
- Incomplete/truncated descriptions require an explicit user acknowledgment before sending.
- A canonical public HTTPS source is required before the popup can claim that a review was sent and is ready to save.
- A capture is never transmitted until the user reviews it and chooses **Send to APWICO**.
- Pending delivery is bounded to the browser session for 30 minutes, contains no credentials, and is discarded on incompatible account switching.
- The worker waits for the exact allowed APWICO destination to finish loading before delivery and retains one bounded capture for explicit retry when acknowledgment fails.

## UX and accessibility

The popup follows Capture → Review → Send, keeps title/company/description primary, collapses optional details, hides developer destination controls from production, and preserves the Wine + Blush assets. The 360 px popup has no horizontal overflow, minimum 44 px action targets, keyboard focus coverage, reduced-motion-safe styling, and a zero-violation automated axe check.

## Verification inventory

- Permanent LinkedIn and Indeed fixtures prove the policy fallback cannot be bypassed by page DOM, selected text, structured data, query variants, or look-alike hosts.
- Greenhouse covers valid, long, wrong-ID, closed, oversize, and look-alike responses.
- Lever, Workday/JSON-LD, explicit selection, duplicate structured data, missing fields, hostile text, and unsupported pages are covered.
- Delivery tests cover exact origins, retry/acknowledgment, popup closure, expired pending data, invalid senders/destinations, URL privacy, app reload restoration, owner switching, and master/job-specific separation.
- Official rules were checked 2026-10-13: LinkedIn's prohibition of scraping software (`linkedin.com/help/linkedin/answer/a1341387`) and Indeed's Terms (`indeed.com/legal`) require fallback unless APWICO later obtains permission. No captured data was transmitted during read-only inspection.
- The unpacked 0.2.5 candidate was loaded through Chrome's extension debugging protocol into a temporary official Google Chrome profile. At 360 px it rendered without horizontal overflow, kept inputs/actions above 320 px and 44 px respectively, and produced the retained visual artifact `/tmp/apwico-extension-025-real-chrome-popup.png`. The temporary profile closed after the test; the normal Chrome profile and published extension were not changed.
- Final preview-backed extension regression on 2026-10-13 passed **54/54** runnable checks with one explicitly gated manual-Chrome check skipped; that same check passed **1/1** separately in official Google Chrome. Package verification passed **3/3** checks for the 16-file 0.2.5 archive.
- The release build and package audit verify version 0.2.5, reviewed package contents, minimal permissions, and no source maps or forbidden files.

## Final packaged-candidate verification — 2026-10-13

- The exact 16-file production package was loaded unpacked in a disposable official Google Chrome profile, not the developer source folder.
- Live Greenhouse capture returned the current job title, employer, location, canonical URL and a 5,716-character complete description.
- The first live Lever check found a current-markup regression. The scoped adapter was corrected to accept exactly one `data-qa="job-description"` section, remove only a literal ` logo` suffix from the employer image label, and exclude adjacent apply/disclaimer content. The rebuilt package then captured the live title, employer, location, canonical URL and job description successfully.
- The live Workday page tested did not expose a qualifying URL-correlated `JobPosting` record, so the package correctly failed closed; Workday remains metadata-dependent and partial by design.
- At 360 CSS pixels the packaged popup had no horizontal overflow, a 324-pixel input, a 44.8-pixel primary action, normal vertical scrolling and visible keyboard focus. The rendered Wine + Blush popup was visually inspected.
- A fictional paste/review/send journey opened production APWICO with title, employer, location, source and description intact; no job content appeared in the destination URL and nothing was saved to an account.
- Final regression after the Lever correction passed **55/55** runnable browser checks (one separately exercised real-Chrome check is environment-gated) and the package gate passed **3/3**.

## Google support case 9-7216000040956

Google replied on 2026-10-12 that public listing details must match the information used during trader verification and referred APWICO to the Trader Disclosure Policy. Google did not authorize separate public contact fields or hiding the verified address/phone. No developer identity, trader status, Payments profile, or legal verification data was changed. Residential address and personal phone removal therefore remain pending a compliant reverification path or clearer Google instruction.

## Chrome Web Store submission — 2026-10-13

- Submitted version: **0.2.5** from the verified 16-file production archive.
- Package SHA-256: `418e8126092ad0856d2aef12b3264162d3bcb6cae4e472d7ac77a6f378163800`.
- Dashboard confirmation: **Your extension was submitted for review**.
- Publication mode: automatic publication after Google approval.
- Store description was aligned with the shipped capture paths: automatic Greenhouse/selected Lever capture, metadata-dependent Workday capture, and explicit LinkedIn/Indeed paste-and-review fallback.
- Existing Wine + Blush icon, screenshot, and small promo tile were retained; permissions and privacy declarations were unchanged and rechecked against the package.
- The temporary ChatGPT browser-extension file-URL permission used to complete the authorized upload was returned to **off** immediately after submission.
- Public 0.2.5 installation and published-version verification remain external-review follow-up work.

## Independent review

The adversarial review identified stale SPA identity, query-ID loss, ambiguous JSON-LD, incomplete-description acknowledgment, auth/reload continuity, look-alike hosts, narrow-layout risks, a selected-card transition race, the single Unicode ellipsis truncation case, and missing-source send continuity. Each confirmed issue was addressed. The final compliance pass then removed direct LinkedIn and Indeed DOM adapters in favor of policy-safe paste fallbacks. No additional confirmed blockers remain in Greenhouse, Lever, Workday, permissions/privacy, authentication continuity, or the narrow popup layout.
