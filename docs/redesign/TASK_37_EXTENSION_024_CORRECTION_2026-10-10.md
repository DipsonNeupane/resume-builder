# Task 37 — public-contact and 0.2.4 correction evidence

Status: **VALIDATION PENDING**. APWICO Job Capture 0.2.3 remains the published
version. Version 0.2.4 is packaged and verified locally but has not been uploaded or
submitted.

## Public developer information

The public Store listing exposes the verified individual trader's legal name, street
address and phone number. The Chrome Web Store publisher settings confirm that these
values come from the publisher's verified Google Payments profile, not from the
extension package or APWICO website.

Chrome's trader-verification policy requires a trader's legal name, contact address and
SMS-capable phone number to be public. The address can be replaced with another truthful,
verifiable address in the same country through Google Payments. Changing the name,
country or phone requires restarting trader verification. Reclassifying the account as
non-trader would be a legal declaration and is not an acceptable privacy workaround.

No repository or dashboard change can legitimately remove these disclosures while the
publisher remains a verified trader. Closure requires the owner to provide or establish
a real non-residential business/service address and an SMS-capable business phone number
that the owner controls, then authorize the corresponding Payments-profile and trader-
verification updates. No legal verification value was changed during this audit.

## UI root cause and correction

The extension is a Chrome toolbar action popup (`action.default_popup`), not a Chrome
Side Panel API surface. Version 0.2.3 changed the popup root to percentage-only sizing.
During Chrome's intrinsic popup-window calculation that left no preferred inline size,
so Chrome collapsed the action UI to min-content width. `max-width: 100vw` reproduces the
same circular sizing failure and is not a valid correction.

Version 0.2.4 gives the action popup a bounded 360px preferred document width while every
field, disclosure and button remains fluid within that viewport. No permission, host,
privacy, extraction, delivery, storage or APWICO destination behavior changed.

## Verification

- Real Chrome toolbar invocation against a controlled Greenhouse page: PASS. The
  packaged popup opened at 375px viewport / 360px body, with no horizontal overflow;
  the first input and primary button were each 322.5px wide.
- Supported capture: PASS. Title, company and job description populated through the real
  toolbar `activeTab` path.
- Unsupported/manual state: visually inspected at 360px; copy, inputs, disclosures and
  actions remain readable with normal vertical scrolling.
- Targeted action-popup layout and accessibility checks: 3/3 PASS.
- Extraction, structured-data and destination-boundary regression set: 21/21 PASS.
- Package allowlist/security/store-asset suite: 4/4 PASS (package inspection plus three
  artifact tests). Production manifest remains limited to `activeTab`, `scripting`,
  `storage`, `alarms` and the existing two APWICO/legacy app hosts.
- Packaged real-Chrome toolbar check: PASS. Candidate version is exactly 0.2.4.
- Refreshed 1280×800 Store screenshot uses the actual corrected popup width and the
  existing Wine + Blush identity. Icon and promo geometry/identity are unchanged.

The ordinary parallel extension run encountered the repository's known cold local-server
timeouts; the bounded serial and real-toolbar checks above passed. No Store upload,
submission, publication, unpublishing or main-site change occurred.
