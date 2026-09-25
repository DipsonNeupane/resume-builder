# Task A — technical SEO (local preparation only)

## Audited architecture and policy

The app is a React/Vite SPA. `src/main.tsx` switches Home, Builder, Account,
Pro and Jobs using React state; these are **not separate public routes**.
Existing `/?account=1`, `/?account=1&reset=1`, callback query/hash parameters,
and `/?pro=1` must keep working. Pricing and templates are homepage sections,
not new pages. Pro renders account billing controls and is not public content.

| Surface | Index/crawl policy |
| --- | --- |
| `https://resumestride.com/` | Indexable public marketing page; canonical `/` |
| `/privacy.html`, `/terms.html` | Indexable static documents; self canonicals |
| `/#how-it-works`, `/#templates`, `/#pricing` | Same homepage; canonical `/`, no separate sitemap entry |
| Account/sign-in/signup/recovery, editor/private resume, Jobs/Saved Jobs/Match, tailoring/job-specific version, Pro/billing, captured-job/recovery overlays | `noindex, nofollow, noarchive`; remove canonical, `og:url` and public schema from the rendered head; generic metadata never includes user data |
| Any query string, including unknown keys and campaign parameters | HTTP noindex and `private, no-store`; no stripping of auth/payment parameters; early browser guard removes public canonical/schema |
| Token/error/recovery or unknown fragments | Early browser noindex guard before auth startup; fragments cannot reach HTTP middleware |
| API responses (including errors) | HTTP noindex; existing authentication/authorization unchanged |
| Unknown paths, including invented `/account`, `/jobs`, `/editor`, `/callback`, `/reset`, `/token/...` paths | Real 404 and noindex. No catch-all homepage rewrite. These never were supported app entry points |
| `www.resumestride.com`, HTTP production origin, `/index.html` | 308 to HTTPS apex and `/`, preserving path/query; only the two explicit owned hostnames redirect |
| Preview/local/other hosts; non-production Vercel environment | HTTP noindex; canonical public references still point to the production apex; no redirect to production from a preview |
| Extension test fixture | Reachable for existing tests; HTTP and HTML noindex; excluded from sitemap |

`robots.txt` deliberately allows crawling, including private entry URLs, so crawlers
can observe HTTP/meta noindex. It is not an access-control mechanism. The sitemap
contains exactly the three public canonical URLs, with no invented last-modified
dates, private states, query strings or fragments. Existing homepage footer and legal
navigation provide ordinary crawlable links connecting all three public pages.

`src/seo/policy.ts` is the shared allowlist. `npm run seo:generate` updates checked-in
HTML heads, robots, sitemap and 404 artifacts; the build also runs it. Static title,
description, canonical, Open Graph and Twitter card metadata work without React.
`public/seo-guard.js` runs before the application, preserving a sensitive-entry flag
even if Supabase consumes a callback URL. That loaded document stays conservatively
non-indexable until a clean reload. In-memory private states are noindex while active;
returning from a normal anonymous editor visit restores the public homepage metadata.
Signed-in homepage/overlays remain conservatively non-indexable in the rendered head.

Only a `WebSite` schema is emitted. No ratings, reviews, offers/pricing, JobPosting,
employer affiliations or unsupported search action are asserted. There is no claim
of an installed/offline PWA: manifest display is `browser`. The favicon reuses the
existing three-bar stride mark; the static PNG social card uses existing public copy.
No AI image service or new runtime dependency is used.

## Implementation and verification boundaries

Root `middleware.ts` applies request policy on Vercel, including static documents
and API responses, without reading account content or making outbound calls. It
uses Vercel's native continuation response (`x-middleware-next: 1`), equivalent to
[the official next helper](https://github.com/vercel/vercel/blob/main/packages/functions/src/middleware.ts).
No request headers are forwarded or overridden. `vercel.json` also gives APIs a
noindex header independently. `vite.config.ts` uses the same request classifier for
local development/preview. Development alone passes Vite's module endpoints and
the exact shared `/apps/extension/src/lib/capture.ts` import (including Vite cache
queries) through to its transformer. Neither preview nor production exposes this
source route: it remains a noindex 404, and `/apps` is not a public route.

The homepage body still requires JavaScript, as it did before this task. It is not
prerendered; social metadata and schema are present in source. Fragment-only private
states cannot receive distinct server headers: fragments never reach servers. They
are guarded in the browser and do not have separate sitemap/public links. Hosting
middleware attachment, CDN cache/redirect behavior and search-engine rendering must
be verified on the later authorized locked deployment. No hosted behavior is claimed
from local tests. Existing deployment protection remains the prelaunch access gate.

Run:

```sh
npm run test:seo
npm run test:server
npm test
npm run test:auth
npm run test:paid
npm run build
npm run check:server
git diff --check
```

`tests/server/seo.test.ts` covers artifacts, exact sitemap allowlist, public source
metadata, schema, images, redirects, request policy, token-fragment guard, API
continuation and HEAD handling. `tests/seo.spec.ts` adds actual HTTP/browser coverage
for metadata transitions, callback guards, navigation, redirects and genuine 404s.
The existing auth/paid suites protect callback, billing and editor behavior.

The default Playwright suite must start its own server (`reuseExistingServer: false`
and `--strictPort`). Reusing an older server can bypass the current SEO middleware,
giving missing noindex headers and SPA fallback 200s for unknown paths. If port 5183
is occupied, stop the process you own before rerunning; do not enable server reuse.
Server tests enforce that configuration and exercise both Vite lifecycle adapters
with Node HTTP request/response objects, without a network listener. These checks
cover GET/HEAD headers, query caching, redirects, 404s and development-module
passthrough, including the shared capture module and its rejection in preview and
production. The browser SEO suite checks the module's JavaScript response and the
mounted homepage CTA. These do not replace hosted HTTP verification. A sandbox
`listen EPERM` is a blocked browser run, not a passing result.

## Owner-only setup — not performed

Do not remove the access lock or submit URLs just to make a verification test pass.
DNS ownership verification can be prepared while the site remains locked; crawling,
indexing checks and sitemap submission wait for an owner-approved public launch.

1. **Confirm production configuration.** Keep `https://resumestride.com` as the
   canonical production origin, assign the apex and `www` to the correct Vercel
   project with valid TLS, and confirm the production environment is labeled
   `VERCEL_ENV=production`. Do not assign the canonical production hostname to a
   preview. Preserve deployment protection until the separate launch authorization.
2. **Google Search Console ownership.** Owner signs into
   [Search Console](https://search.google.com/search-console), chooses **Add property →
   Domain**, enters `resumestride.com` (no scheme/path), and copies the generated
   **TXT** verification value. At the authoritative DNS provider, add that exact
   value as a TXT record on the apex (`@` or the provider's empty apex field), using
   the default TTL. Do not replace existing TXT records. Return to Search Console
   and choose **Verify** after propagation. Retain the TXT record. The real value
   must come from the owner's dashboard; no placeholder token is committed.
   See [Google's verification instructions](https://support.google.com/webmasters/answer/9008080?hl=en).
3. **Bing ownership.** Owner signs into [Bing Webmaster Tools](https://www.bing.com/webmasters/),
   manually adds `https://resumestride.com`, selects its DNS CNAME verification
   option and copies the exact **host/name and target** supplied by Bing into the
   authoritative DNS zone. Do not guess the label/target or overwrite other records.
   Return to Bing and choose **Verify** after propagation; retain the record.
   Alternatively, the owner may explicitly authorize Search Console import, which
   can also import sitemaps. DNS setup is preferable while locked and requires no
   HTML token or public access. See [Bing's verification options](https://www2.bing.com/webmasters/help/add-and-verify-site-12184f8b).
4. **Verify the authorized locked release.** Using owner access, inspect middleware
   attachment and GET/HEAD responses: homepage/legal 200; `www`/HTTP/index aliases
   308 without query loss; unknown path 404; account/reset/pro/query and API responses
   noindex; preview homepage noindex. Check an unknown query as well as known keys.
   Load an auth callback and complete recovery with controlled test accounts, then
   navigate editor → Jobs → Pro → home and inspect head metadata. Check real social
   PNG/favicon URLs, robots/sitemap content types and CSP console output. Confirm a
   cached query response never changes the clean homepage's indexing header.
5. **After separate public-launch approval only**, verify without bypass credentials
   that public pages and crawler assets are reachable and the three clean URLs have
   no `X-Robots-Tag: noindex`. Confirm private/query/preview noindex still applies.
   In Google Search Console select the verified property → **Sitemaps**, submit
   `https://resumestride.com/sitemap.xml` (or `sitemap.xml` in a URL-prefix property's
   prefilled field). In Bing select the site → **Sitemaps → Submit sitemap**, submit
   the same complete URL. Verify processing succeeds and only three URLs are listed.
   See [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
   and [Bing sitemap guidance](https://www2.bing.com/webmasters/help/sitemaps-3b5cf6ed).
6. **Inspect and monitor.** Use Google URL Inspection / live test and Bing URL
   Inspection on the three public URLs; check rendered content, declared/selected
   canonical and crawl permission. Request homepage indexing only after those
   checks. Inspect a representative non-secret `/?account=1` and unknown path to
   confirm exclusion/404; never paste real recovery tokens or private identifiers
   into webmaster tools. Monitor indexing reports for accidental query, preview,
   API or fixture URLs. Sitemap submission does not guarantee indexing.

No DNS record, verification token, dashboard action, sitemap submission, deployment,
access-lock change or external indexing request was performed in Task A.

Policy references: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
[Vercel routing middleware](https://vercel.com/docs/routing-middleware/api).
