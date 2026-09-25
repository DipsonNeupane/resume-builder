# Local compatibility and accessibility preparation — task #59

September 24, 2026. Local changes only; no deployment, hosted configuration,
provider/model requests, purchases, or owner's subjective visual acceptance.

## Attempt 3: exact destination-heading assertions

FLOW supplied a subsequent Chromium result of **71/72 default cases passing**.
Both product focus repairs passed; the remaining delayed/cached-route regression
failed because `#main-content h1` matched the Home page title and two sample-resume
names. Both Home return assertions now use the exact accessible level-one heading
name, `One career. More than one version.`. They still require that unique heading
to be focused; no `.first()`, relaxed assertion, timing delay or product change was
introduced. The current Web Interface Guidelines were fetched again for review.

This attempt passed server/billing **378/378**, local database **553 ok assertions**,
production build/client typecheck, server typecheck and explicit TypeScript checking
of the accessibility test and browser configurations. The build required the
documented installed ARM esbuild override and retains the existing ~528kB entry
chunk and Vercel Analytics directive warnings.

Targeted dialog/lazy-route tests were attempted first, then the full explicit
Chromium/Firefox/WebKit default, auth and paid suites. All stopped before tests or
axe at `listen EPERM` on their respective 5183/5174/5181 ports. Direct launches
reconfirmed Chromium's Mach-port permission denial/SIGTRAP and the exact missing
Firefox 1543 and WebKit 2359 paths below. The supplied 71/72 run is parent evidence;
this session does **not** claim a fresh browser or axe pass. Final runtime acceptance
of the corrected selector remains pending in a system-enabled local session.

## Attempt 2: focus acceptance repairs

FLOW's intervening Chromium verification ran 71 default cases: 69 passed and two
failed (sample-dialog initial focus and Pro → Account heading focus). That result
is supplied parent evidence, not a successful run in this restricted session.

The shared dialog now explicitly focuses its first enabled, visible, sequentially
focusable control after `showModal()`. The same control discovery drives the Tab
trap; a dialog without controls keeps focus on itself. Native background isolation,
Escape/backdrop dismissal, opener restoration and disabled-opener fallback remain.

The route effect previously selected the first matching h1 and returned success
even when `focus()` failed. A reused Suspense boundary can retain the previous
route's main with `display:none`, so that hidden Pro heading could prematurely
complete the Account focus request. It now selects a rendered, visible heading,
checks `document.activeElement` before completing, and observes visibility-related
attribute changes as well as lazy child insertion. Loading headings remain excluded.

Both original failing tests are unchanged. A new regression explicitly holds the
Account module request, verifies the fallback does not receive focus, then checks
the loaded Account heading, Home/Jobs navigation and cached Pro/Account navigation.
Its TypeScript check and discovery pass; runtime acceptance is still pending.

The targeted test command was attempted first, followed by full explicit
Chromium/Firefox/WebKit default, auth and paid commands. All hit the fresh-server
permission failures recorded below before browser tests or axe could execute.
Direct engine launch reconfirmed Chromium's Mach-port denial and both missing
engine paths. No engine installation, permission bypass or deployment was attempted.

## Scope and source review

Reviewed the existing default, mocked-auth and mocked-paid Playwright configurations
and tests before changing them, and used the current
[Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).
The default browser remains Chromium. `PLAYWRIGHT_BROWSERS` explicitly selects
Chromium, Firefox and/or WebKit for each of those three suites. Unsupported names
fail configuration; unavailable engines are not silently skipped. Fresh isolated
servers and test-only auth configuration remain mandatory.

Objective fixes:

- `src/components/Modal.tsx`: sample and upgrade dialogs now use native modal
  isolation, initial focus, forward/reverse Tab containment, Escape, backdrop
  dismissal, scroll locking and focus restoration. Downloads provide a focusable
  fallback group when an async quota response has disabled the original action.
- `src/main.tsx`: mobile disclosure precedes its links in keyboard order, identifies
  its controlled navigation, closes on Escape and returns focus to its toggle.
  Choosing a homepage anchor focuses the destination instead of a hidden link.
  In-app page changes focus the destination heading after a lazy route resolves;
  the Jobs loading state now also includes a heading within its existing main.
- `src/design-system.css`: explicit field-scoped `:focus-visible` rings override
  the legacy, more-specific `outline:none`; focus destinations have scroll margin.
  Modal content can scroll at short heights, and long account/job text can wrap.
- Builder and captured-job fields identify input purpose using names, autocomplete
  and email/tel/URL input types where appropriate. Locale and international phone
  formats remain unrestricted. Invalid resume-language feedback is announced.
- `src/features/auth/AuthPanel.tsx`: mismatched password validation identifies and
  focuses the affected input, associates its announced error and clears that state
  on correction. Email/password autocomplete remains mode-appropriate.
- `src/features/tailoring/TailoringPanel.tsx`: Accept/Reject retains focus on the
  reviewed suggestion when its action buttons disappear; existing live review
  counts and master-resume protection remain intact.
- Explicit JavaScript scrolling honors reduced motion, in addition to the existing
  CSS transition/animation override. Viewport zoom remains enabled.

No pricing, entitlement, data ownership, AI accounting or export policy changed.
The strict pricing bottom-alignment test and existing axe rules remain unchanged.

## Coverage prepared

| Suite | Cases per engine | Coverage |
| --- | ---: | --- |
| Default | 72 | Public navigation and pricing; builder validation, import, preview and persistence; existing SEO/security tests; full-page axe; keyboard/menu/dialog/input-purpose/reduced-motion regressions; delayed/cached lazy-route focus; long international content |
| Auth | 40 | Mocked signup/signin/recovery/session/cloud flows; password-error focus; axe and overflow for signup, signin and reset forms |
| Paid | 70 | Mocked billing and PDF/DOCX workflows; Jobs, Saved Jobs, Match, account isolation, tailoring and accepted-edit persistence; upgrade-dialog keyboard/axe tests and disabled-opener recovery |

The existing public/document and Jobs/Match/tailoring responsive loops retain
320px, 390px and 1440px and add 768px tablet and 1920px desktop. New auth and
upgrade-dialog loops use 320/390/768/1920px. Assertions are retained or strengthened;
no axe exclusion or relaxed layout tolerance was added. This matrix contains
546 cases across all three engines. Listing cases is **not** executing them.

## Observed local verification

| Check | Result |
| --- | --- |
| Server/billing tests | 378 passed, 0 failed |
| Local database suite (PGlite) | 553 `ok` assertions, exit 0 |
| Production build including SEO generation and client typecheck | Passed with installed ARM esbuild override; existing >500kB entry-chunk warning remains (~528kB) |
| Server typecheck | Passed |
| Changed Playwright tests/config TypeScript check | Passed |
| Three-engine default/auth/paid discovery | Passed; 216 / 120 / 210 cases |
| Git diff whitespace check | Passed |
| Graphify AST update | Completed without API calls; 4,188 nodes / 7,235 edges / 411 communities |
| Browser suites and axe | **Blocked before execution**; not a pass |

Engine/environment blockers, observed directly:

1. The normal `arch -arm64 npm test` and initial build encounter mixed child-process
   architecture: `@esbuild/darwin-arm64` is installed, but a child expects
   `@esbuild/darwin-x64`. Using the installed esbuild binary through the environment
   variable below resolves this without installing or changing dependencies.
2. Default/auth/paid servers then fail with `listen EPERM: operation not permitted`
   at `127.0.0.1:5183`, `127.0.0.1:5174`, and `127.0.0.1:5181`, respectively.
3. Direct Chromium launch also fails with
   `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.<pid>:
   Permission denied (1100)` and exits via SIGTRAP. Installed executable:
   `~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
4. Firefox executable is missing:
   `~/Library/Caches/ms-playwright/firefox-1543/firefox/Nightly.app/Contents/MacOS/firefox`.
5. WebKit executable is missing:
   `~/Library/Caches/ms-playwright/webkit-2359/pw_run.sh`.

This session cannot grant system/browser permissions or write the engine cache.
No browser launch restriction was bypassed and no existing developer server was
reused. Browser rendering, actual screen-reader behavior, final overflow/clipping,
rendered contrast and cross-engine export delivery therefore remain unverified.
The server suite exercises export contracts; it does not establish browser PDF
preview or physical device fidelity.

Source-token contrast arithmetic, using the WCAG relative-luminance formula:
action/white 5.86:1; placeholder/white 4.73:1; body/canvas 12.60:1;
secondary/canvas 6.12:1; error/error surface 5.93:1; attention/attention surface
7.59:1. These pairs meet AA normal-text contrast. This is **not** a claim that all
rendered states or user-selected resume accent colors pass; execute axe to check
the rendered interfaces, including hover/focus/error/dialog states.

## Rerun on an owner/system-enabled local machine

Install the missing matching engines outside this restricted session:

```sh
arch -arm64 npx playwright install firefox webkit
```

On this mixed-architecture installation, use the already installed binary:

```sh
export ESBUILD_BINARY_PATH="$PWD/node_modules/@esbuild/darwin-arm64/bin/esbuild"
arch -arm64 npm test -- tests/accessibility.spec.ts -g 'sample dialog|lazy route'
arch -arm64 npm test -- tests/builder.spec.ts -g 'Pricing cards stay balanced'
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit arch -arm64 npm test
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit arch -arm64 npm run test:auth
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit arch -arm64 npm run test:paid
arch -arm64 npm run test:server
arch -arm64 npm run test:db
arch -arm64 npm run build
arch -arm64 npm run check:server
git diff --check
graphify update .
```

Omit `ESBUILD_BINARY_PATH` on a consistently installed platform. The three browser
commands retain all existing flows, including mocked server exports; they do not
enable live Techmap, AI or Stripe calls. Review failures without loosening tests.

## Separate owner-only subjective review

No subjective visual defects were established in this session: the browser could
not run and the owner's final review was explicitly out of scope. Keep the later
locked-production review separate: typography and hierarchy, perceived density
and spacing, wording preferences, perceived preview fidelity and overall visual
acceptance across physical devices. Screen-reader testing, mobile Safari/Firefox
device behavior and real downloaded document inspection also remain manual
acceptance work. Automated Playwright WebKit is not a claim of testing every
Safari/iOS version. Do not deploy as part of this preparation.
