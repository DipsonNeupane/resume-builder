# AI provider selection — provisional, 2026-09-18

Recommend starting evaluation with OpenAI GPT-5.4 mini, with a configurable model/provider adapter. This is a cost/quality candidate, not a claim it is universally best or cheapest. No API key is configured, no live generation was run, and no paid credits were purchased.

Official listed token prices reviewed:
- GPT-5.4 mini: $0.75/million input, $4.50/million output. https://developers.openai.com/api/docs/models/gpt-5.4-mini
- Claude Haiku 4.5: $1/million input, $5/million output. https://platform.claude.com/docs/en/about-claude/pricing

Illustration only: 5,000 input + 2,000 output tokens cost $0.01275 on GPT-5.4 mini or $0.015 on Haiku 4.5 at these rates, excluding retries, extra/reasoning tokens and infrastructure. Real cost must be measured using provider usage responses.

Before release: evaluate grounded bullet edits, non-English/RTL resumes, job keyword matching and cover letters with a consented/synthetic fixture set; reject invented claims and prefer explicit missing-information questions. Use server-only secrets, structured validation, bounded output/timeouts/retries, per-account rate limits and a global spending circuit breaker. No live calls until a server-side API key and spending authorization are configured. Claude CLI subscription access used for development is not an API credential for this product.

Owner approved an initial USD 25/month production AI cap. Provider API funding/key is still pending. Reserve worst-case request cost atomically before generation; settle actual cost afterward, include failed/uncertain calls conservatively, reject requests exceeding remaining budget, and never rely solely on provider dashboard alerts as a hard stop. No customer content should be used for evaluation without consent.
