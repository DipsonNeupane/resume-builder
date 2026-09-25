# ResumeStride vertical video drafts

Three captioned, silent MP4 drafts, 1080×1920 (9:16), around20seconds each. Recorded from the deployed free beta using fictional Alex Morgan details. These are real app screen demonstrations with editorial caption overlays; no AI tailoring or interview outcome is staged. Source capture is540×960, upscaled for delivery. No social posting, music license, voiceover or advertising spend.

1. **01-no-experience.mp4** — first-job applicants: explicit no-work-experience choice, projects and volunteering, resume preview.
2. **02-free-resume.mp4** — details, experience, three template choices, preview and browser Print / Save as PDF.
3. **03-clearer-wording.mp4** — a manual wording edit removes filler without inventing accomplishments. Not a demo of paid AI.

Suggested captions:
- Your first resume can start with projects and volunteering. Describe what you actually did. Build yours free at resumestride.com.
- Your experience, clearly presented. Three templates and free browser Print / Save as PDF. Try resumestride.com.
- Start your resume bullets with what you do. Keep the facts; cut the filler. Build and edit free at resumestride.com.

Review: opening frame and final preview screenshots inspected; third draft re-recorded to restore scroll position for the final resume view. Capture verification reports zero page errors and zero Supabase requests. MP4s decoded with ffmpeg for corruption checks. Drafts still need your editorial review and chosen social account before posting. No signup/cloud saving, generated-PDF quota, paid AI or extension availability advertised.

Re-record with `node scripts/record-marketing-drafts.mjs`; optional VIDEO_ONLY=03-clearer-wording selects one draft. This uses an isolated browser profile and fictional local storage only. WebM sources and preview PNGs are retained. MP4 conversion used temporary ffmpeg-static dependency in /tmp/resumestride-video-tools (not installed in the application). A Homebrew ffmpeg attempt was cancelled before installation/upgrades because it planned broad dependencies.
