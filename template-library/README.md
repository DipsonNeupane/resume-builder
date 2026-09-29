# ResumeStride Premium Template Library

Integrated with the production Builder and PDF export path. Billing and entitlement
authority remain in the server/database layers; this directory owns template metadata,
renderers, bundled fonts, verification fixtures and the development lab.

```
npx vite --config template-library/lab/vite.config.ts          # Template Lab → http://127.0.0.1:5178/
node --import tsx --test template-library/tests/library.test.ts # unit tests
node --import tsx template-library/scripts/verify.ts            # preview + PDF + DOCX checks (lab must be running)
npx tsc -p template-library/tsconfig.json --noEmit               # typecheck
```

| Path | Role |
|---|---|
| `registry.ts` | Metadata for all 27 templates (7 Free, 20 Premium) + factual discovery labels |
| `document.ts` | Pure normalizer: Builder `Resume` → structured view (section roles, skill groups, `Stack:`/`Link:` details, safe links). Never drops or invents content |
| `templates/` | Twenty Premium renderers (`<id>.tsx` + `<id>.css`), shared parts, `base.css` |
| `fonts/` | Bundled OFL font subsets + licences + generated `fonts.css` |
| `fixtures.ts` | Ten fictional resumes in the exact Builder model (all pass `isResume` + `validateAll`) |
| `lab/` | Template Lab (Free via the production preview component; Premium via same-geometry paginator) |
| `export/premium-pdf.ts` | PDF path mirroring `server/export/render.ts` (embedded fonts, JS off, network off) |

## Research summary (Sept 2026)

Surveyed Kickresume, Enhancv, Resume.io, Canva, Rezi, Teal, Novoresume and FlowCV
galleries and their public guidance.

- **Where libraries are repetitive.** Most galleries of 30–50+ templates collapse into
  ~4 skeletons: single-column with a coloured header; two-column with a tinted sidebar
  (photo, skill bars, icons); a centred "classic"; a timeline. Names and colours vary,
  structure rarely does. Skill bars, photo circles and icon rows dominate "creative" sets.
- **What users actually choose between.** One vs two columns, colour vs restraint, and
  one page vs multi-page. Enhancv and Resume.io also browse by career stage / industry
  (entry-level, executive, healthcare, finance, tech) — but mostly re-tag the same layouts.
- **Underserved.** Academic CVs (numbered publications, research-first order); clinical
  licensure; projects-first technical resumes where stack is evidence; consulting
  answer-first bullets; high-density long careers that are *restructured*, not just
  shrunk; executive resumes that show progression within one employer; portfolio
  resumes that index case studies rather than decorate.
- **Formatting practicality.** Vendor-published parser tests on multi-column layouts
  disagree (some report clean parsing, others flag reading-order interleaving). There is
  no independent evidence strong enough for any "ATS" label, so none is used. Design
  rules adopted instead: **DOM order = reading order** in every prototype; no text in
  images; no skill bars, icons-as-content or photos; real selectable text and real links.

## Existing seven — coverage assessment

All seven share one markup (`src/components/resumeMarkup.ts`) and differ only in CSS:
single column, identical order (header → profile → sections in user order → skills
paragraph last), same entry anatomy. Territory occupied: header treatments (accent rule,
centred serif, filled band, split flex, double rule), heading treatments, and two
densities (standard, compact). **Unoccupied:** section reordering, dates-in-rail,
hanging headings, employer grouping, projects-first, skills integrated or up front,
citation formatting, card grids, run-in dense lines, and any non-Noto typography
(Classic's Georgia falls back to Noto Sans in the server PDF where Georgia is absent).

## The 20 Premium templates

Full per-template spec lives in `registry.ts` and in the Lab's side panel.

| Family | Template — structural idea |
|---|---|
| Executive | **Boardroom** — employer-grouped progression, highlights grid · **Mandate** — one-line career overview, then board appointments, then detail (serif) |
| Technical | **Stackline** — stack matrix + projects first · **Kernel** — numbered spec sections, right date column, per-role stack tags |
| Portfolio | **Casebook** — case-study cards · **Atelier** — asymmetric header, recognition first, client-led entries |
| Academic | **Scholar** — full CV, numbered citations · **Bench** — methods matrix, Methods lines, serif citations in a sans resume |
| Traditional | **Charter** — credentials register first, education before experience, ruled register headings, monochrome · **Plainsong** — black-only, no rules, hierarchy by weight |
| Clinical | **Rounds** — licensure verification table first, setting/unit emphasis |
| Modern | **Meridian** — hanging-heading rail · **Crossover** — strengths band + per-role "skills in context" (literal matches only) |
| Compact | **Almanac** — date rail, run-in lines, 9pt · **Roster** — table rows (organization · role · dates) with one outcome line |
| Early career | **Primer** — education → projects → experience → activities, airy |
| Consulting | **Pyramid** — organization-first rows, bold answer-first lead-ins, run-in closing block |
| Data | **Quartile** — figures in semibold tabular accent, ruled tools matrix |
| Operations | **Waypoint** — continuous timeline, dates + location lead line, Scope lines |
| Product | **Cadence** — project entries naming an employer nest under that role as shipped-work callouts |

## Data-model compatibility

Prototypes consume the unchanged Builder `Resume`. They add *reading conventions*, not
fields: section roles come from `kind`/title (e.g. "Publications", "Selected work",
"Licensure"); optional detail lines such as `Stack:`, `Link:`, `DOI:`, `Methods:`,
`Scope:`, `Outcome:` are lifted into metadata. In Free templates those same lines render
as bullets, so switching is lossless. Nothing is inferred: "skills in context", figure
emphasis and employer nesting only re-present the user's own words.

The Builder model and database validator accept the same explicit 27-template allowlist.

## Fonts (deterministic, bundled, no network)

`fonts/` holds the Latin + Latin Extended subsets of seven OFL-1.1 families from
fontsource 5.3.0 (1.3 MB, licences included): Newsreader, Source Sans 3, IBM Plex Sans /
Sans Condensed / Mono, Instrument Sans, Instrument Serif. `scripts/vendor-fonts.mjs`
regenerates `fonts/fonts.css`. The Lab loads them locally; the PDF path embeds them as
`data:` URIs with the same Noto script fallbacks production already embeds (Arabic,
Devanagari, SC). No request leaves the machine; the verifier fails on any external request.

**Source Serif 4 was replaced by Newsreader.** Source Serif 4 maps its curly-quote glyphs
to U+02BB/U+02BC as well as U+2018/U+2019, and Chromium writes the modifier letters into
the PDF text layer (copy/paste and parsers see "companyʼs"). It is intrinsic to the font;
patching it would require renaming (Reserved Font Name "Source"). Newsreader (OFL, no
RFN issue, same transitional character and optical-size axis) extracts correctly. Every
bundled family is checked by `scripts/apostrophe-probe.ts`. Newsreader has no true small
caps, so templates use tracked uppercase instead, and `.pt-paper` pins
`font-synthesis:none` so preview and PDF can never diverge on synthesized styles.

## Pagination (preview = PDF)

The production preview lays every template out at true print geometry (A4/Letter in CSS mm, 16mm
margins, 10pt type) and only *scales* them for display. Line and page breaks therefore
come from the same geometry as the PDF instead of a viewport-relative font size. Two
shared CSS defects were fixed on the way: `break-inside: avoid-page` (honoured by print,
ignored by preview columns) was removed, and a last child's `break-after: avoid` (which
propagates to ancestors and glued whole sections together) is reset in `base.css`.

**Zero-size freeze.** Because the flow has fixed physical dimensions from the first frame,
it can never be a 0×0 column — the Phase 1 freeze cannot occur. The production Builder
paginator is untouched: it renders only Free markup, which has no unbreakable grids and
passes all fixtures. When Premium templates enter the Builder, they must use this
geometry-first paginator (and it is the recommended replacement for Free at that time,
with the Builder regression suite).

## DOCX (decision recorded for user-facing wording)

- **PDF preserves the selected visual template.**
- **DOCX is a clean, editable document representation** — the same structure for all 27
  templates. It is verified to contain all text; it does not reproduce layout or styling.
- Do not describe DOCX as matching the selected template. Suggested wording:
  "PDF keeps your template's design. Word (.docx) gives you a clean, editable version of
  the same content."

## Adding templates (~5 per release)

1. Add or flip the entry in `registry.ts` (`status`, `releasedAt`, `cohort`).
2. Add `templates/<id>.tsx` + `<id>.css`; register in `templates/index.tsx`.
3. Run the verifier. The Lab, grouping, badges and NEW labels pick it up automatically.

`NEW` derives from `releasedAt` only; `POPULAR` requires ids passed in from real usage
data; no recommendation logic exists.
