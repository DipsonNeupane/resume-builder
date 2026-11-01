# Product-demo campaign measurement

Use Vercel Web Analytics and the existing privacy-closed product events. Do not add resume text, job descriptions, search terms, account identifiers, source URLs, prompts, or suggestion text to analytics.

## Comparison path

`SOURCE → LANDING → TOOL / RESOURCE → BUILDER → JOBS → MATCH → TAILOR → PRO`

| Stage | Evidence | Interpretation |
| --- | --- | --- |
| Source | First-touch `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` | Which draft placement started the browser session. |
| Landing | `landing_page_view` | Attributed visits that reached the public product story. |
| Tool / resource | `tool_viewed`, `tool_started`, `tool_completed`, `tool_cta_clicked`; or `content_page_view`, `content_cta_clicked` | Whether educational surfaces help a visitor take the next step. These are optional branches, not mandatory gates. |
| Builder | `builder_started`, `resume_created`, `resume_completed`, `template_selected` | Whether visitors move from understanding to product use. |
| Jobs | `jobs_viewed`, `jobs_search_performed`, `job_saved`, `saved_jobs_viewed` | Whether the opportunity workflow is reached and used. |
| Match | `match_opened`, `match_completed` | Whether evidence analysis is inspected. Do not convert labels into a numeric ATS metric. |
| Tailor | `tailoring_started`, `suggestion_reviewed`, `suggestion_accepted`, `suggestion_rejected`, `job_specific_resume_completed` | Whether review-first tailoring is used; acceptance and rejection are both valid engagement. |
| Pro | `pricing_viewed`, `upgrade_prompt_viewed`, `checkout_started`, `pro_activated` | Whether value understanding continues to a paid decision. |

Review channel cohorts weekly only after deployment and publication are separately approved. Report raw counts and stage-to-stage ranges alongside sample sizes. Do not rank a channel from a handful of visits, treat owner/test sessions as demand, infer causality from one touch, or optimize for acceptance of AI suggestions—rejection is part of the promised control model. Compare `utm_content` only when the same channel has enough traffic for a useful directional read.

