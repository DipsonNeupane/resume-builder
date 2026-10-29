# Public-route performance budgets

Status date: 2026-09-29. These are redesign-branch **lab budgets**, not claims about production field performance.

## Field baseline boundary

The read-only production snapshot records a desktop Vercel Real Experience Score of 71 from 83 displayed events and no mobile events in the selected seven-day view. Individual LCP, INP and CLS values were unavailable in the current plan view. They remain **unavailable**, not zero, and are not fabricated here. A later production release plan must define field monitoring and owner-approved thresholds from real data.

## Enforced artifact budgets

| Surface | Budget | Enforcement |
| --- | --- | --- |
| Homepage initial JavaScript | <= 670 KiB raw and <= 195 KiB gzip | `npm run performance:budgets` reads the built entry referenced by `dist/index.html` |
| Homepage initial CSS | <= 210 KiB raw and <= 38 KiB gzip | Same build-artifact check |
| Public matcher JavaScript | <= 30 KiB raw and <= 10 KiB gzip across its three static scripts | Same check |
| Template gallery JavaScript | <= 4 KiB raw and <= 2 KiB gzip | Same check; the gallery is meaningful without JavaScript and this script only applies filters |
| Template gallery CSS | <= 16 KiB raw and <= 4 KiB gzip | Same check |
| Heavy feature boundaries | Jobs, fictional sample, export controls, PDF import and DOCX parsing remain separate lazy chunks | Same check fails if a named chunk disappears |

These ceilings are intentionally close to the pre-batch local build rather than aspirational field numbers. Any increase requires a documented tradeoff and a deliberate budget update.

## Runtime policy and lab checks

- LCP target for desktop/mobile lab runs: <= 3.0 s on the local production preview. This is a regression signal, not field data.
- CLS target: <= 0.10 in lab checks. Hero media has stable layout space. The primary UI font stylesheet is currently fetched from Google Fonts with `display=swap` and system fallbacks; document/coverage fonts are bundled. Self-hosting the primary display fonts remains a future optimization, not a fabricated completed item.
- Primary CTA navigation signal: destination URL commits in <= 1,000 ms in the local lab. This is not a field INP measurement.
- Homepage WebGL: initialize only in idle time after primary content; use the complete CSS fallback on data-saver or <=2 logical-core devices.
- Reduced motion: no decorative animation loop; the deferred shader draws at most a static frame.
- Workspace, parser, PDF, DOCX and fictional-sample code stay deferred off initial public routes.
- Mobile/low-powered devices retain all content and actions without depending on WebGL, hover, drag or animation.

The consolidated quality gate runs the artifact budget after the production build and the public performance browser checks with the other public-route checks.
