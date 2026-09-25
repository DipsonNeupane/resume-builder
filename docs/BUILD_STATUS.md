# ResumeStride build status — September 20, 2026

This is the current launch inventory. Newer entries in `HANDOFF.md` and the September 20 checkpoint supersede older checklist language. Test accounts and example.com identities are fictional acceptance fixtures, not acquired users.

## Live and verified

- **Paid web:** `https://resumestride.com` is live on the paid release (`dpl_B3VmUTjZ63de9zANTunzCrWmFNN8`). Signup before download, the $19.99 one-time 30-day Pro pass, optional explicitly selected recurring renewal, generated PDF quota, and AI suggestions requiring user review are enabled. Production smoke, paid UI, server, build/package, PDF, and provider acceptance evidence is recorded in `HANDOFF.md` and the listed `/tmp/resumestride-*.log` files.
- **Payments:** Sandbox manual/subscription, idempotency, refund, cancellation, and entitlement-period behavior passed. Automatic live delivery of two unpaid `checkout.session.expired` events was verified. No live card was charged; no live charge lifecycle is claimed.
- **Authentication and isolation:** Production and recovery-project isolation checks passed with fictional fixtures. Draft data remains browser-local unless an explicitly enabled cloud flow is used; this is not an account-private storage boundary.
- **Global product scope:** The builder remains intended for every occupation and country, with Unicode, RTL content, flexible sections, and A4/Letter output.
- **Vercel Web Analytics:** Installed and deployed. Dashboard recorded 1 visitor / 1 page view from our verification visit (test traffic, not an acquired customer). Query parameters/fragments are removed from page URLs. CLI59.23.2 and Vercel Skills installed; privacy notice updated.

## Implemented locally, unreleased or separately gated

- **Cloud saving/recovery:** The current local frontend passed a real-browser recovery-project persistence check (consent, insert, edit, reload, and deletion cascade). Public production cloud saving remains OFF. Real hosted two-client stale-revision conflicts and both resolution choices also passed. Production deployment acceptance and a populated physical backup/restore drill are still required before enablement. A fictional revision2 specimen is retained in the isolated recovery project; expected hashes are in docs/verification/backup-canary.json. Latest observed physical snapshot is September20 11:23:53UTC, before the specimen; waiting for a later daily snapshot, then restoration verification.
- **Chrome extension:** Local extension tests and an isolated-world live Greenhouse capture passed, including title/company/description extraction and truncation handling. The production bridge is implemented locally; signed-in and account-transition regression checks passed. Production bridge deployment/delivery, installed toolbar lifecycle, and store readiness remain incomplete. The production manifest was not granted the temporary live-site permission used for the isolated test; LinkedIn and generic job-site support are not claimed.
- **Local source versus release:** Reviewed extension/cloud-related source changes are not evidence that the live paid deployment contains those capabilities. Do not deploy or advertise them as customer features until their separate gates pass.
- **Marketing assets:** Scripts/storyboards may be prepared locally, but no social account is connected and no post or ad spend has occurred.

## Remaining engineering priorities

1. Deploy and verify the locally reviewed extension receiver/bridge, then complete manual Chrome toolbar acceptance and store readiness.
2. Complete hosted production cloud browser acceptance, a populated physical backup/restore verification. Keep cloud disabled until these pass.
3. Prepare Higgsfield marketing assets after the owner connects the API and social destinations.
4. Update the recurring status automation to reflect the paid-live and automatic-expiry state, without reverting to auth-only assumptions.

## Owner actions

- When back at the laptop, load `/Users/dipson/ResumeBuild'r/apps/extension` unpacked through Chrome’s Extensions manager, enable Developer mode, and test the toolbar on a public Greenhouse job posting. Browser automation is explicitly blocked from opening the extension manager by policy; do not bypass that block. This is an extension acceptance gate only.
- Create/connect TikTok and Instagram accounts and configure the Higgsfield API for final marketing videos. No publishing destination is connected yet; marketing cannot publish until this is done.
- No additional Stripe, OpenAI, email, password, identity, or payment setup is currently blocking the live web release.

## Contradictions and interpretation

- Older sections of `docs/OWNER_LAUNCH_TODO.md` still describe an auth-only/free-beta launch and say paid launch is incomplete. Those statements are historical; the newest handoff and checkpoint document the paid release now live.
- A successful local recovery check does not mean production cloud is enabled, and a Greenhouse isolated-world capture does not mean the extension toolbar or store release is ready.
- Passing acceptance suites with synthetic accounts does not establish real customers, production usage, or live charging.

## Evidence pointers

See the newest `HANDOFF.md` entries and `docs/RESUME_CHECKPOINT_2026-09-20.md`. Key logs include `/tmp/resumestride-paid-launch-smoke.log`, `/tmp/resumestride-live-expiry-acceptance.log`, `/tmp/resumestride-cloud-browser-acceptance.log`, `/tmp/resumestride-greenhouse-isolated-live.log`, `/tmp/resumestride-extension-final-review.log`, and `/tmp/resumestride-hosted-revision-recovery.log`.
