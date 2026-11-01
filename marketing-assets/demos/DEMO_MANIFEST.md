# ResumeStride product demo manifest

These are capture directions for the real Patina application, using only the fictional state in `capture-growth-assets.mjs`. Raw recordings stay in `marketing-assets/demos/raw/` and are not part of the client build. The checked-in stills are final reusable exports; video is capture-ready because this environment has reliable Playwright WebM capture but no installed, verified MP4 encoder.

## Shared capture rules

- Start the local paid-fixture build with `VITE_SUPABASE_URL=https://auth-test.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=test-public-placeholder`, `VITE_BILLING_UI_ENABLED=true`, and `VITE_PAID_FEATURES_UI_ENABLED=true`.
- Use `ASSET_BASE_URL=http://127.0.0.1:5195 node marketing-assets/demos/capture-growth-assets.mjs` for stills.
- Record only the browser viewport: no browser chrome, terminal, DevTools, debug UI, protection UI, or cursor wandering.
- Use the fictional Alex Morgan / Example Learning Co. state. Keep “Fictional demonstration data” visible in editorial exports.
- Record at normal speed. Pause 0.6–1.0 seconds after each state change. Prefer cuts between states over accelerated cursor travel.
- Export layouts independently at 1600×900 (16:9), 1080×1080 (1:1), and 1080×1920 (9:16). Re-run the viewport-specific sequence; do not center-crop one master.

## 01 — One master. Many opportunities.

Caption: **Create a separate resume for an opportunity while your master stays unchanged.**

- Short demo, 10 seconds: master preview (0–2s) → Jobs / saved opportunity (2–4s) → “Tailor my resume for this job” (4–6s) → job-specific editor with “Master resume preserved separately” and “Return to master resume” visible (6–10s).
- Micro loop, 5 seconds: master label → Tailor action → job-specific label → return to the master label with a cut. Do not show edits transferring back to the master.
- Start: Builder preview labelled “Master resume.”
- End: separate job-specific version for Customer Success Specialist; master-preservation notice visible.
- Overlay: “ONE MASTER. MORE THAN ONE VERSION.”

## 02 — See the evidence.

Caption: **Connect each requirement to real resume evidence—without an ATS score or hiring prediction.**

- Short demo, 9 seconds: saved job card (0–2s) → open Full evidence analysis (2–3s) → clearly demonstrated evidence (3–5s) → partially demonstrated evidence (5–7s) → not demonstrated requirement (7–9s).
- Micro loop, 5 seconds: requirement row expands to evidence, then collapses. Use all three status rows in the frame; never add a percentage.
- Start: Full evidence analysis collapsed.
- End: three truthful status rows visible with the source evidence quote.
- Overlay: “SEE WHAT YOUR EXPERIENCE ALREADY PROVES.”

## 03 — Tailor without making things up.

Caption: **Review the source, then accept, reject, or edit every suggestion yourself.**

- Short demo, 12 seconds: tailoring control strip (0–2s) → suggestion Before / After / Why (2–6s) → Reject second suggestion (6–8s) → Accept first suggestion (8–10s) → edit the accepted wording in the real editor (10–12s).
- Micro loop, 6 seconds: pending suggestion → Accept → accepted state → cut back to pending. The Before text and Why rationale remain visible.
- Start: pending suggestion with Accept and Reject.
- End: accepted-and-saved confirmation in the job-specific version; master remains unchanged.
- Overlay: “AI SUGGESTS. YOU DECIDE.”

## 04 — From job to application.

Caption: **Save a role, inspect the match, open a separate resume, and tailor it under your control.**

- Short demo, 15 seconds: Jobs (0–2s) → Search jobs (2–4s) → Save job (4–6s) → Match Analysis (6–9s) → Tailor my resume (9–12s) → AI review controls (12–15s).
- Micro loop, 7 seconds: use a five-cut progression—Jobs → Saved → Match → Job-specific resume → Tailor. No apply/autofill action is implied.
- Start: Find jobs page with the fictional result.
- End: job-specific tailoring review, not a submitted application.
- Overlay: “FROM JOB TO APPLICATION.”

## 05 — Seven templates. Same experience.

Caption: **Switch the layout without changing your words, qualifications, or experience.**

- Short demo, 12 seconds: open Templates (0–2s) → Modern (2–3s) → Classic (3–4s) → Minimal (4–5s) → Compact (5–6s) → Bold (6–7s) → Executive (7–8s) → Ledger (8–10s) → same Alex Morgan wording close-up (10–12s).
- Micro loop, 6 seconds: Modern → Bold → Ledger → Modern. Use deliberate one-second holds; no morphing effect outside the product.
- Start/end: Modern template with identical resume data.
- End proof: name, headline, first role, and first experience bullet match the start frame exactly.
- Overlay: “SEVEN TEMPLATES. SAME EXPERIENCE.”

## Video delivery checklist

For each exported file, verify duration, dimensions, decodability, silent audio track or no audio, first/last frame readability, fictional disclosure, and no account/token/network error text. Preferred names are `<story>-short-<format>.mp4` and `<story>-loop-<format>.mp4`. Keep WebM/raw frames under `demos/raw/`; only reviewed delivery files belong under `demos/exports/`.

