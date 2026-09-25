# Privacy disclosure checklist — factual, as-built

This checklist describes what the current codebase actually does, verified by reading
the implementation (not aspirational policy). It is written for whoever drafts the
public privacy notice before launch; it does not itself constitute that notice, and it
invents no retention/legal commitments beyond what the code enforces today. Update it
whenever the underlying behavior changes.

## Accounts
- Password forms hold the entered password temporarily in browser component state and
  send it through the Supabase Auth client (`src/features/auth/AuthPanel.tsx`). It is
  not sent to ResumeStride's API or persisted by application draft/diagnostic storage.
  The browser client holds a publishable key and Auth session, never the service-role key.
- Account-authenticated APIs re-verify bearer tokens against Supabase
  (`server/http/security.ts`, `authenticate()`) rather than trusting decoded claims,
  and reject anonymous Supabase sessions. The Stripe webhook instead verifies its signature.
- All authenticated data access on the server is scoped to the verified `owner_id` derived
  from that token — no endpoint accepts a client-supplied user id.

## Resumes (master and job-specific)
- `resumes`/`resume_revisions` (Supabase Postgres) are the only tables the browser reaches
  directly (via PostgREST), gated by Row Level Security policies keyed to `auth.uid()`.
  Every other resume-adjacent table (job-specific resume versions, tailoring inputs) is
  reached only through server-authenticated RPCs.
- Resume content is never rendered via `innerHTML`/`dangerouslySetInnerHTML`; React's
  default escaping applies to all imported/typed content.
- Imported DOCX/PDF files are parsed locally in the browser; a decompression-bomb guard
  caps DOCX inflate output at 25MB, and every parsed field is length-clamped before it
  reaches the editor, AI requests, or export.

## Saved jobs, Match Analysis, and search preferences
- Saved jobs, preferences, and match analyses are stored per-owner. The API derives
  the owner from the verified token and passes it to service-role-only RPCs; SQL filters
  by that supplied owner. These privileged RPCs do not independently verify the user's
  token. Browser roles cannot call them, so server ownership checks remain essential.
- Job search requests forward only `title`/`countryCode`/`workplace` to the Techmap
  provider; employment type, salary preference, free-text location, and all resume
  evidence stay server-side and are never sent upstream.
- Job search results are cached by search signature only (no account identifier in the
  cache key), so an identical public query may be served from a shared cache across
  accounts — no private data is included in what's cached.

## OpenAI (resume tailoring)
- A tailoring request is rejected unless the caller explicitly sets `consent: true` in
  that exact request; consent is not persisted or inferred from a prior request.
- Pro/Free entitlement is re-checked server-side before any provider call; a Free account
  cannot reach the OpenAI path by manipulating the client.
- Outbound request size is capped (40,000 bytes); output has token, schema and application
  bounds. Exact source-field and numeric-grounding checks reduce fabrication risk but
  cannot establish the truth of every rewrite. Users must review suggestions before use.
- Each provider call first reserves against the global monthly AI budget, with per-owner
  limits and idempotency. Known usage is settled even for invalid output; unknown or
  anomalous usage retains a reservation pending evidence-based reconciliation.
- Job description text passed to the model is explicitly labeled as reference data, not
  instructions, in the system prompt.

## Techmap (job search provider)
- The Techmap API key lives only in server environment configuration; it is never sent to
  the browser, embedded in a response, or echoed in an error message.
- Techmap responses are bounded (2MB cap, fixed page size) before any further processing.
- As of this audit, a per-owner request throttle (40 requests / 10 minutes, see
  `supabase/migrations/20260924220000_jobs_search_throttle.sql`) now bounds how often an
  authenticated account can trigger new provider fetches, closing a gap where varying the
  search title could bypass the existing cache.

## Extension capture
- The production extension requests `activeTab`, `scripting`, `storage`, and `alarms`,
  with the sole host permission `https://resumestride.com/*`. Delivery accepts only the
  exact HTTPS root destination. Local ports are allowed only in development builds;
  `scripts/package-extension.mjs` removes them from the production artifact.
- Captured job text is bounded (300 chars for short fields, 12,000 chars for the
  description) both at extraction time and again by the receiving web app.
- One pending capture is held in `chrome.storage.session`, cleared on delivery/discard,
  and expires 30 minutes after its latest save. Explicit edits/retries can refresh that
  expiry. Reads and an alarm clear expired data; browser scheduling can delay cleanup.
- The extension never holds a ResumeStride session/auth token. Delivery into the web app
  is a same-origin `postMessage` carrying only job text; the web app treats that message
  as untrusted input and requires its own authenticated session before anything is saved
  to an account — the message itself grants no privilege.
- Captured/extracted content is parsed via an inert `<template>` (scripts/forms stripped)
  and rendered as text, not HTML, so a malicious source page cannot inject script through
  a captured posting.

## Payments (Stripe)
- Checkout success/cancel redirect URLs are constructed server-side from configuration,
  never accepted from the client, so there is no open-redirect surface through checkout.
- The webhook endpoint verifies the Stripe signature (`stripe.webhooks.constructEvent`)
  and rejects events with mismatched livemode or a Connect `account` field before acting
  on them.
- Entitlement changes (Pro access) are driven only by verified webhook events and
  server-side RPCs, never by a client-asserted purchase state.

## Analytics / monitoring
- Task C: `src/services/analytics.ts` restricts pageviews to known public production
  URLs, rejects queries/unknown fragments/custom events, and reconstructs event
  fields. Server diagnostics contain only fixed categories, timing, generated
  request IDs and boolean feature gates. Browser diagnostics are bounded memory;
  extension delivery diagnostics remain in the worker console. See
  [OBSERVABILITY.md](OBSERVABILITY.md) for exact boundaries and owner verification
  of host metadata, retention and any future monitoring integration.
- `@vercel/analytics` (`src/main.tsx`) provides Vercel's standard page-view analytics;
  no resume, job, or tailoring content is passed into analytics calls anywhere in the
  codebase (verified by search — analytics usage is limited to the `<Analytics />`
  mount, no custom event payloads carrying user content).
- Server error responses are sanitized (`safeError()` in `server/http/security.ts`):
  only an `HttpError`'s own message or a generic 503 is ever returned, never a stack
  trace, internal path, or secret.

## Retention / deletion
- There is no general time-based retention/deletion job. Explicit document/bookmark
  removal and Auth-user deletion have different effects: job versions survive removal
  of their source bookmark/master, while master deletion removes its checkpoints.
  Owned rows with `on delete cascade` are removed on Auth-user deletion. This does not
  delete provider records/backups or cancel a Stripe subscription; support must coordinate
  those separately. See [the recovery audit](PRODUCTION_READINESS_AUDIT.md).
- There is currently no self-service "delete my account" UI/API in this codebase —
  account deletion today is an Auth-admin operation. If the public launch requires a
  self-service deletion flow, that is a real product gap to close before claiming one
  publicly; this checklist does not invent that it exists.
- Extension-captured job text has the client-side inactivity expiry described above
  and does not persist server-side unless the signed-in user
  explicitly saves it.

## What this checklist does not establish
This is a code-behavior audit, not a legal review. It does not determine data-processing
agreements with OpenAI/Techmap/Stripe/Supabase/Vercel, does not confirm subprocessor
disclosures are published anywhere, and does not itself satisfy GDPR/CCPA notice
requirements — those still need an actual owner-authored privacy policy informed by the
facts above.
