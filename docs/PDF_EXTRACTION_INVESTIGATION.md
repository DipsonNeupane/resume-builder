# PDF text-extraction investigation: Arabic/Devanagari NUL mappings

Status: preliminary investigation; proposed repair NOT approved for production.

## Independent review correction

The original investigation below overstates what was verified. Bundled Poppler `pdftotext` reads the original PDFs with zero NULs and exact Hindi/Chinese text, but Arabic ordering/spacing is imperfect. Thus extraction varies by reader; the statement below that pdftotext ignores ActualText is incorrect. Both tested JS/Python extractors failing does not independently rule out reader limitations.

The scratch repair assumes character-to-glyph correspondence, reuses font-wide CID mappings across contexts, inserts additional ZWJ characters, and lacks multi-page/repeated-ligature coverage. It must NOT be integrated based on the small sample. PDFKit alternatives were not prototyped and cannot be ruled out by the unsupported shaping claim below. Hosted Chromium was not run: equal major versions are not evidence of identical deployed behavior.

Original findings retained below as investigation notes, not accepted release evidence. Global extraction/reading-order validation remains open.

Original status (superseded): investigation complete, root cause confirmed with reproducible evidence,
practical fix prototyped and verified. Not yet implemented in the app (out of
scope for this pass — see "Proposed fix" below for what an implementer needs to
do). No app/renderer/package files were changed for this investigation.

## Summary

Chromium renders Arabic and Devanagari correctly (shaping, joining, reordering
all visually correct), but the `/ToUnicode` CMap that Chromium's PDF backend
(Skia's `SkPDF`) writes for those glyphs is broken: characters that only exist
in the output as a *shaped* glyph (an Arabic joining form, a Devanagari
reordered/split matra, a base+mark decomposition) get mapped to `U+0000` (NUL)
or, in the Arabic case, sometimes to the wrong-but-plausible-looking
compatibility codepoint (Arabic Presentation Forms, `U+FE70`–`U+FEFF`) instead
of the real letter. This is **not** a font problem — swapping variable fonts
for static instances doesn't touch it, because the bug is in how Chromium
derives the CID→Unicode table, not in the font's outlines or `cmap` table
coverage.

The good news: Chromium already computes the correct text and embeds it in the
same PDF, via `/ActualText` marked-content spans wrapping the shaped glyph
runs (the standard PDF mechanism for exactly this class of problem, per ISO
32000-1 §14.9.4 — normally used for ligatures). Generic extractors
(`pdf-parse`/pdf.js, `pypdf`) don't consult `/ActualText` when producing plain
text, so they fall back to the broken `/ToUnicode` table and produce NULs. A
post-processing step that copies Chromium's own `/ActualText` values into the
`/ToUnicode` CMap makes both extractors produce fully correct text, with zero
new/hidden/duplicate content — only the existing CID→Unicode table is
corrected using data Chromium already computed for the same glyphs.

## Reproduction

Generated real PDFs with the existing pipeline (`server/export/render.tsx` via
`scripts/check-generated-pdfs.ts`, Playwright's bundled Chromium
`153.0.8010.12`, isolated headless process, no user profile, no live data):

```
cd "ResumeBuild'r" && npx tsx scripts/check-generated-pdfs.ts
# -> /tmp/resumestride-pdf-qa/{modern,classic,minimal}-{A4,Letter}.pdf
```

Extracting the sample string `"Languages sample: العربية — हिंदी — 中文."`
with two independent, industry-standard libraries:

**pdfjs-dist 5.4.296 via `pdf-parse` 2.4.5** (already a repo dependency):
```
"ice. Languages sample: \u0000 ﻪ\u0000\u0000\u0000\u0000ﺮﻌﻟا — \u0000ह\u0000दी — 中文."
codepoints: ... 0 20 feea 0 0 0 0 feae fecc fedf 627 ... 0 939 0 926 940 ...
```

**pypdf 6.19.0** (Python, installed only into a scratch venv, not the repo):
```
'ice. Languages sample: اﻟﻌﺮ\x00\x00\x00\x00ﻪ — ह\x00दी  — 中 文 .'
```

Both tools, which use entirely independent codebases, produce the same NUL
positions and the same wrong presentation-form codepoints — this rules out an
extractor bug and confirms the defect is in the generated PDF itself. This
reproduces across every template/paper combination tested (`modern-A4`,
`modern-Letter`, `classic-A4`, `minimal-A4`) — same font pipeline, same
result, so it's systemic, not one-off.

CJK (`中文`) and Latin text extract perfectly; only scripts requiring GSUB
shaping (Arabic joining forms, Devanagari matra reordering/conjuncts) are
affected.

## Root cause, confirmed

Inspecting the raw PDF objects (`pypdf`, no external tools like `qpdf`/`mutool`
available or needed):

1. The Arabic and Devanagari runs are drawn with `Tj`/`TJ` against embedded
   `Type0` subset fonts (`NotoSansArabic-Regular`, and — mislabelled by
   Chromium's subsetter as `NotoSans-Regular` — the Devanagari subset). Static
   font instances confirmed as before (`server/export/fonts/NotoSansArabic.ttf`,
   `NotoSansDevanagari.ttf`), so this isn't a variable-font interpolation
   artifact.

2. Each glyph run is wrapped in inline PDF marked content that Chromium itself
   emits:
   ```
   /Span<</ActualText <FEFF064A> >> BDC
   ... <013F> Tj ...
   EMC
   ```
   Decoding all `/ActualText` spans in `modern-A4.pdf` gives the **fully
   correct** source text for every affected run:
   ```
   FEFF0629 -> ة   FEFF064A -> ي   FEFF0628 -> ب
   FEFF0631 -> ر   FEFF0639 -> ع   FEFF0644 -> ل
   FEFF0939093F0902 -> हिं
   FEFF09260940 -> दी
   ```
   i.e. Chromium *knows* the correct Unicode text for these shaped glyphs and
   writes it into the PDF — it just writes it to the wrong table for plain-text
   extraction.

3. The font's `/ToUnicode` CMap (the table both `pdf-parse`/pdf.js and `pypdf`
   actually use for extraction) has no entry — or the wrong entry — for the
   CIDs used by those same glyphs. This is why extraction fails while ActualText
   is complete and correct.

4. A secondary, narrower cause within the same bug: some Arabic letters (the
   dotted ones — ة, ي, ب) are drawn as **two** glyphs (a base glyph + a
   separate combining dot-mark glyph, an Arabic font-engineering technique).
   The `/ActualText` span covers the *character*, not each *glyph*, so the
   extra mark-component CID has no character of its own and is a separate,
   smaller contributor to the NUL pattern. Non-dotted letters (ر, ع, ل) and
   all of Devanagari draw 1 glyph per character and don't hit this.

**Chromium/Playwright version was not the variable.** Both the production path
(`@sparticuz/chromium` 153.0.0) and the QA path (Playwright's bundled Chromium
`153.0.8010.12`) are the same current Chromium major version, and the bug
reproduces identically on both — there is no newer bundled Chromium available
to test against in this environment, and the mechanism (ToUnicode built from
per-glyph font-cmap reverse lookup, disconnected from the ActualText the same
code path already computes) is a structural gap, not a regression a point
release is likely to have quietly fixed.

## Alternatives investigated and ruled out

- **`font-feature-settings` tuning**: the Arabic joining forms and Devanagari
  matra reordering that break ToUnicode are produced by *mandatory* OpenType
  GSUB features (`init`/`medi`/`fina`/`isol` for Arabic, `nukt`/`akhn`/`rphf`/
  `pref`/`blwf`/`vatu` etc. for Devanagari) — not optional ligatures. Disabling
  them to dodge the bug would make Arabic render as disconnected isolated
  letters and break Devanagari reordering, i.e. trade a text-extraction bug for
  a visible-rendering bug. Not viable.

- **Chromium's tagged-PDF option**: Puppeteer's `page.pdf({tagged: true})` is
  already the *default* (confirmed in `puppeteer-core` 25.11.0's
  `PDFOptions.ts`), so `server/export/render.tsx` already produces tagged PDF
  with a `/StructTreeRoot`. Walked the struct tree — it carries no
  `/ActualText` of its own for these runs (the `/ActualText` only exists inline
  in the content stream's marked-content spans, not on the structure elements).
  Tagged PDF doesn't add a working escape hatch here; it's a red herring.

- **`pdf-parse`'s `includeMarkedContent` option / raw `pdfjs-dist`
  `getTextContent({includeMarkedContent: true})`**: tested directly against
  `pdfjs-dist` 5.4.296 (the version `pdf-parse` bundles). Confirmed by reading
  `pdf.worker.mjs`: `/ActualText` is only consumed by pdf.js's PDF *authoring*
  code and its structure-tree/accessibility export, never by
  `getTextContent()`. `includeMarkedContent: true` only adds
  `beginMarkedContent`/`endMarkedContent` structural markers to the item list —
  it does not surface the ActualText value or substitute it into `.str`. This
  path does not fix extraction for `pdf-parse`, `pdftotext`, or any tool built
  on plain `getTextContent()`.

- **PDFKit-based alternate renderer**: not prototyped in depth. PDFKit has no
  built-in complex-script shaping or bidi reordering — it draws characters
  using their raw codepoints without GSUB — so it would render Arabic as
  unjoined isolated letters and get Devanagari matra order wrong (the same
  visual defect as disabling GSUB above). Making it correct would require
  externally shaping text with HarfBuzz and feeding PDFKit raw glyph IDs, at
  which point it inherits the same fundamental CID↔Unicode disconnect this
  investigation is about, plus loses layout parity with the existing
  HTML/CSS `ResumePreview` used for on-screen preview. Not a practical
  alternative to fixing the ToUnicode table.

## Proposed fix (prototyped and verified, not yet applied to the app)

Post-process each generated PDF to repair `/ToUnicode` using the `/ActualText`
Chromium already writes:

1. Walk the page content stream, tracking the active font (`Tf`) and any open
   `/Span<</ActualText <hex>>> BDC ... EMC` region.
2. For each CID drawn inside such a region, consume one character from the
   decoded ActualText string in glyph order. If a region draws more CIDs than
   the ActualText string has characters (the dotted-Arabic base+mark case),
   map the extra CID(s) to `U+200D` (ZERO WIDTH JOINER) rather than leaving
   them unmapped.
3. Merge these corrections into each affected font's existing `/ToUnicode`
   CMap (`bfchar` entries), overriding only the CIDs that were wrong; leave
   everything else untouched.

This changes **only** the `/ToUnicode` metadata table used for text
extraction — it does not touch the content stream's drawing operators, so
rendered/printed output is byte-for-byte unaffected. It introduces no new
visible text, no hidden duplicate layer, and no fabricated content: every
corrected mapping is copied verbatim from a value Chromium itself already
computed and embedded for that exact glyph.

### Prototype and verification (scratch only, not in the repo)

`/tmp/resumestride-pdf-investigation/repair_tounicode.py` implements the above
using `pypdf` (installed only into a throwaway venv at
`/tmp/resumestride-pdf-investigation/venv`, not added to the app). Run against
all four sampled PDFs:

| File | Before (pypdf) | After (pypdf) |
|---|---|---|
| modern-A4 | `اﻟﻌﺮ\x00\x00\x00\x00ﻪ` / `ह\x00दी` | `العربية` / `हिंदी` |
| modern-Letter | same NUL pattern | `العربية` / `हिंदी` |
| classic-A4 | same NUL pattern | `العربية` / `हिंदी` |
| minimal-A4 | same NUL pattern | `العربية` / `हिंदी` |

Zero `\x00` remain in any of the four repaired files, verified independently
with both `pypdf.PdfReader.extract_text()` and `pdfjs-dist`'s
`getTextContent()` (via `pdf-parse`, already a repo dependency). Arabic text
extracts as the fully correct canonical letters (not presentation forms);
Devanagari extracts as an exact match, `हिंदी`, character for character.

**One extractor-specific wrinkle found and fixed during prototyping**: an
initial version mapped the "extra" base+mark CIDs to an empty string, which is
spec-legal and worked perfectly in `pypdf`, but `pdfjs-dist`'s CMap lookup does
`dst || fallback` — confirmed by reading `pdf.worker.mjs` (`parseBfChar` →
`CMap.mapOne`/`lookup`) — so an empty (falsy) string destination is silently
discarded in favor of a raw-CID fallback, producing garbage ASCII/control
characters instead of nothing. Switching those entries to `U+200D` (non-empty,
invisible on copy) fixed `pdf-parse` too. Any production implementation should
use a non-empty invisible placeholder for this reason, not an empty
`bfchar` destination.

### What's left for an implementer (not done here — scope of this task was investigation only)

- Port `repair_tounicode.py`'s logic into the actual export pipeline
  (`server/export/render.tsx`, after `page.pdf()` returns bytes but before the
  size check), using a reviewed JS PDF-editing library (e.g. `pdf-lib`) rather
  than the scratch regex-based content-stream walk, which is a reasonable
  investigation tool but not hardened for arbitrary resume content (it assumes
  a single, simple content stream and `Identity-H` 2-byte CIDs, both true of
  Chromium's output here but worth asserting rather than assuming in
  production code).
- Add a regression test asserting NUL-free extraction of Arabic/Devanagari
  sample text via `pdf-parse`, extending `scripts/check-generated-pdfs.ts`'s
  existing `'FINAL EXPORT MARKER'` check pattern.
- Known non-goal of this fix: visual **reading order** of extracted RTL text
  (e.g. whether copy-pasted Arabic comes out in logical vs. visual order) is a
  separate, well-known, cosmetic PDF/RTL extraction limitation unrelated to
  the NUL bug and is not addressed by this change.

## Environment used

- Chromium: Playwright bundled `153.0.8010.12` (`~/Library/Caches/ms-playwright/chromium-1243`),
  launched headless via CLI in an isolated process (no user profile), matching
  `@sparticuz/chromium` `153.0.0` used in production — no version skew found.
- `pdf-parse` 2.4.5 / `pdfjs-dist` 5.4.296 — existing repo dependency, used read-only.
- `pypdf` 6.19.0, `fonttools` 4.60.2 — installed only into
  `/tmp/resumestride-pdf-investigation/venv`, never added to the repo.
- No app, renderer, or package files were modified. No secrets, live credentials,
  or real user data were used (sample data only, from `src/model.ts`'s `example()`).
