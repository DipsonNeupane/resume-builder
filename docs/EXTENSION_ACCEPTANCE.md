# Extension V1 acceptance — task #47

## Automated commands

```
npm run build:extension
npm run package:extension
npm run test:extension
npx playwright test --config playwright.capture.config.ts
npm run test:server
npm run test:db
npm run test:paid
npm run test:auth
npm test
npm run build
npm run check:server
git diff --check
graphify update .
```

Use the documented `ESBUILD_BINARY_PATH=.../node_modules/@esbuild/darwin-arm64/bin/esbuild`
override on this checkout's Rosetta-mixed Node installation if required. It changes only
which installed esbuild executable runs; do not change package/model/pricing configuration.

`tests/extension/installed.spec.ts` splits the automated proof explicitly:

- **Toolbar → activeTab extraction:** `Extensions.triggerAction` invokes the real action
  on a controlled HTTPS Greenhouse tab with no job-host permission. Injection must fail
  with Chrome's specific host-permission denial before invocation. A service-worker
  `chrome.storage.onChanged` observer is registered and acknowledged before the single
  trigger, starting from empty session storage. Only the production popup invokes the
  extractor and writes the capture. The test requires the exact title, company,
  description, Greenhouse adapter, source URL, fresh capture time and bounded expiry,
  then confirms persisted state and the newly readable active tab URL. It never seeds
  storage, injects after the grant, opens popup.html as a tab, or waits for a popup Page.
- **Installed popup UI → review/edit/delivery:** the separate existing popup-tab tests
  use the installed extension and real Chrome APIs to edit and send reviewed text,
  verify the app's exact received description and session cleanup, including delivery
  after closing the popup. These tests do not claim a toolbar grant.

Task #51 diagnosis: this checkout installs Playwright **1.63.0**. In
`node_modules/playwright-core/lib/coreBundle.js`, `CRBrowser._onAttachedToTarget` reads
`process.env.PW_CHROMIUM_ATTACH_TO_OTHER` **on every target attachment**; it is not
cached during import. `createInProcessPlaywright` hosts the driver in the same Node
process for these local launches. Setting the flag inside the test before launch was
therefore effective. Moving it before the import would not fix the reported popup
lifetime/Playwright Page initialization race. The page listener was already registered
before `Extensions.triggerAction`; registration order was not the remaining defect.

The replacement avoids the undocumented attach flag entirely. A storage event can arrive
before the protocol command resolves or after the popup disappears; the worker retains
its promise independently of the popup. No sleeps, trigger retries, increased timeouts,
synthetic DOM, permission or product changes are involved. Full toolbar-popup UI attachment
is not claimed deterministic. Human toolbar/live-site acceptance remains required.

The config retains the 41 ordinary checks followed by the isolated one-worker `@toolbar`
project, and explicitly disables retries. Isolation protects the real popup while its
production extraction persists, without relying on it remaining open for UI automation.

For task #51 stability acceptance, run **two sequential complete invocations**:

```sh
npm run test:extension -- --retries=0
npm run test:extension -- --retries=0
```

Do not run other browser suites concurrently. Use full invocations because Playwright's
CLI `--repeat-each` does not repeat dependency projects. Managed-worker startup failures
and actual outcomes are recorded in HANDOFF; discovery is not runtime stability evidence.

Reference: [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab),
[CDP extension actions](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Extensions.pdl).
Focus behavior: [Chrome action popups](https://developer.chrome.com/docs/extensions/develop/ui/add-popup).
Scheduling: [Playwright project dependencies](https://playwright.dev/docs/test-projects#dependencies).

## Required human Chrome acceptance before release

Task #61 provides the dated, unexecuted owner [LIVE ACCEPTANCE checklist](EXTENSION_LIVE_ACCEPTANCE.md)
and expanded [store materials](EXTENSION_STORE_READINESS.md). Preparation did not install
or submit an extension. The steps below remain later owner actions; prior parent
controlled toolbar passes in HANDOFF do not establish real-site acceptance of the ZIP.

Use a disposable Chrome profile and **the production package** first; an official app
release is separately required for real production saves. For local app handoff use the
development package only, with the approved local API environment/mocked provider setup.

1. Load unpacked, pin ResumeStride. Inspect permissions: no Greenhouse/Lever/Workday host
   grant, no all-sites access. Start on a real public Greenhouse job URL.
2. Click the actual toolbar icon. Confirm title/company/description load (including long
   descriptions and truncation notice). If Chrome denies access, record URL/browser version
   and stop acceptance; do not “fix” it by granting broad/job-site host permissions.
3. Tab through every control; edit job text/location/structured salary; verify source path
   has no query/fragment. Send to the approved app and check success/receipt. No job content
   should appear in app URL/query/hash or logs. Do not use real personal/private resume data.
4. Close popup during slow delivery; check the worker finishes. Simulate failure; reopen and
   retry the retained edited capture. Discard it; verify no session item. Repeat after 30
   minutes / browser restart and confirm expired content does not reappear.
5. Sign in in the app, save, see the normal Match Analysis. Retry the same URL, then save a
   provider result of the same job: one immutable bookmark, no extra Free slot. Verify Free
   limit error keeps the capture for retry and never creates a new persistent resume.
6. With a test Pro entitlement and mocked model/export responses, create/reopen one version,
   review each rationale, Reject then Accept, verify autosave, manual edit and PDF/DOCX use
   only that version. Return to the unchanged master. Reload and reopen the saved version.
7. Switch/sign out before saving and while a save is in flight: no capture, saved record or
   stale response may appear in the new account. Try a second account's saved/version IDs:
   server must reject, never call the model.
8. Test generic JSON-LD (one job, multiple jobs, malformed/oversized/absent data), partial
   Lever markup, Workday without metadata, LinkedIn/Indeed and browser internal pages.
   Unsupported cases must remain manual entry, with no speculative full-page capture.
9. Navigate to a different job origin: the old activeTab permission must not persist. Confirm
   the production package refuses local/arbitrary destinations, credentials and subpaths.

## Evidence boundary

Historical Greenhouse live isolated-world extraction used a temporary test-only host grant;
it did **not** establish toolbar acceptance. Task #47 does not relabel it as such.
Current managed-worker listener/browser restrictions and final suite outcomes are recorded
in HANDOFF. All provider/model responses in automated tests are fixtures, never live quota.
No deployment, publication, store login or external submission is performed by these tests.
