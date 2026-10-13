# Extension 0.2.5 major-board capture evidence

Status: release candidate only. Do not submit or deploy without owner authorization.

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

## Independent review

The adversarial review identified stale SPA identity, query-ID loss, ambiguous JSON-LD, incomplete-description acknowledgment, auth/reload continuity, look-alike hosts, narrow-layout risks, a selected-card transition race, the single Unicode ellipsis truncation case, and missing-source send continuity. Each confirmed issue was addressed. The final compliance pass then removed direct LinkedIn and Indeed DOM adapters in favor of policy-safe paste fallbacks. No additional confirmed blockers remain in Greenhouse, Lever, Workday, permissions/privacy, authentication continuity, or the narrow popup layout.
