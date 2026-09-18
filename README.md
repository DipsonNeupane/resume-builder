# ResumeStride

A local-first resume builder for every career and location. React + TypeScript + Vite.

## Run locally

```
npm install
npm run dev
npm run build
npm test
```

The builder includes three templates, flexible sections, local autosave, validated JSON backup import/export, A4/Letter paper sizes, right-to-left content, and browser Print / Save as PDF. The interface and built-in headings are English; content supports Unicode. Browser printing can span multiple pages. Disable browser headers/footers in the print dialog.

## Current boundaries

This is a functional local beta, not a production paid service. No accounts, cloud sync, AI, payments, DOCX export, or PDF/Word import are connected. The import button accepts ResumeStride JSON backups only. Data is stored on the current browser/device; download backups before clearing browser data. Google Fonts is the only external UI resource; resume content is not transmitted by the application. Support contact: support@resumestride.com. Production domain: resumestride.com (not yet deployed there — see HANDOFF.md).

## Launch sequence

1. Validate exported PDFs, long resumes, keyboard access, multilingual fonts, and mobile workflows with real users.
2. Add editable/localized built-in headings and full interface localization based on demand.
3. Implement authentication, database ownership checks, recoverable revisions, account deletion, and backup restoration.
4. Add reliable server-side PDF/DOCX and existing-document import with user review.
5. Add opt-in AI suggestions with clear limits, grounded edits, and accept/reject controls.
6. Introduce a non-renewing paid pass only after entitlement, webhook, refund, and support flows are verified.
7. Deploy with monitoring, real support contact, privacy/terms, and tested recovery procedures.

No restriction by occupation or country. Sections can describe employment, education, projects, volunteering, certifications, research, or other experience. A one-to-two-day target is appropriate for a scoped beta; production billing and global localization require separate verification.

## Continuing with another agent

Read [HANDOFF.md](HANDOFF.md) for the prioritized checklist, current verification, known limitations, and a ready-to-use continuation prompt. [AGENTS.md](AGENTS.md) points coding agents to this handoff automatically.
