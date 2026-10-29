export type ComparisonPage = {
  slug: string;
  vendor: string;
  description: string;
  strengths: string[];
  boundaries: string[];
  freeAccess: string;
  paidAccess: string;
  workflow: string;
  evidenceMethod: string;
  billing: string;
  sources: Array<{ label: string; url: string; kind: 'pricing' | 'feature'; locale: string; currency: string | null; checkedAt: `${number}-${number}-${number}`; nextReviewAt: `${number}-${number}-${number}` }>;
};

const pricingReview = '2026-10-30' as const;
const featureReview = '2026-12-29' as const;
const source = (label: string, url: string, kind: 'pricing' | 'feature', locale = 'English-language public source', currency: string | null = null) => ({ label, url, kind, locale, currency, checkedAt: '2026-09-30' as const, nextReviewAt: kind === 'pricing' ? pricingReview : featureReview });

export const comparisonReviewedOn = '2026-09-30' as const;
export const comparisonReviewer = 'APWICO evidence review' as const;
export const evidenceIsCurrent = (nextReviewAt: string, today = new Date().toISOString().slice(0, 10)) => nextReviewAt >= today;
export const resumeStrideComparisonBoundaries = [] as const;

// Vendor-described public facts only. These pages do not test private behavior,
// rank vendors or repeat outcome claims. Locale-dependent prices are omitted
// unless a stable official source and displayed locale are recorded.
export const comparisons: ComparisonPage[] = [
  {
    slug: 'teal', vendor: 'Teal', description: 'A factual comparison of Teal and APWICO across resume creation, job tracking, matching, payment and evidence control.',
    strengths: ['Teal publishes an integrated job tracker and resume workflow.', 'Its official pricing page describes unlimited resumes on Free and Teal+ and multiple subscription durations.', 'Its help center documents builder, matcher, import, analysis and export workflows.'],
    boundaries: ['Teal describes keyword matching and a Match Score; APWICO centers requirement-level source wording and evidence states without a dominant percentage.', 'Vendor pages cannot establish private processing behavior or applicant outcomes.', 'Pricing and plan limits can change and must be rechecked after the displayed review date.'],
    freeAccess: 'The official US/English pricing page displayed a Free plan with unlimited resumes and job tracking, 10 resume templates and a limited top-five keyword view.',
    paidAccess: 'The same page displayed Teal+ weekly, 30-day and 90-day recurring options with full keyword analysis and additional paid features.',
    workflow: 'Teal combines resume creation, matching and job tracking. APWICO combines a master resume, requirement-level evidence review, a user pursue decision and separate job-specific versions.',
    evidenceMethod: 'Teal publicly describes keywords and Match Score. APWICO shows the requirement, employer source wording and resume evidence together, including “not demonstrated” as an unknown rather than a hiring verdict.',
    billing: 'Teal’s checked pricing/help sources describe recurring access and cancellation at the end of the billing period. Confirm the current displayed terms at purchase.',
    sources: [source('Teal — Pricing', 'https://www.tealhq.com/pricing', 'pricing', 'United States / English', 'USD'), source('Teal Help — Teal versus Teal+', 'https://help.tealhq.com/en/articles/9530153-teal-vs-teal', 'feature'), source('Teal Help — Resume Builder collection', 'https://help.tealhq.com/en/collections/9568976-resume-builder', 'feature')],
  },
  {
    slug: 'huntr', vendor: 'Huntr', description: 'A factual comparison of Huntr and APWICO across base and tailored resumes, application tracking, matching and payment.',
    strengths: ['Huntr publishes a job-search CRM with job, contact and application tracking.', 'Its help center distinguishes base resumes from tailored resumes.', 'Its checked pricing page described free PDF export and all templates on the Free tier.'],
    boundaries: ['Huntr describes resume scoring and keyword matching; APWICO uses requirement-level evidence states and leaves the pursue decision to the user.', 'The official pricing response was locale-specific and can change; users should verify the live page.', 'No claim is made about either product’s private systems or hiring outcomes.'],
    freeAccess: 'The checked official pricing response described unlimited base resumes, free PDF export, all templates, two tailored resume/application packets and tracking up to 100 jobs.',
    paidAccess: 'The same source described recurring Pro access with unlimited tailored resumes, AI features and job tracking; verify current price, locale and cadence on the live page.',
    workflow: 'Huntr presents base and tailored resumes inside a broader job tracker. APWICO preserves one master and creates a separate job-specific version after evidence review and user decision.',
    evidenceMethod: 'Huntr publicly describes match/scoring tools. APWICO does not present a hiring probability or ATS pass score.',
    billing: 'The checked official page displayed recurring monthly, quarterly and six-month options in the US/English view. Exact prices are intentionally omitted here because the current response is locale-dependent.',
    sources: [source('Huntr — Pricing', 'https://huntr.co/pricing', 'pricing', 'United States / English view', 'USD'), source('Huntr Help — Understanding the Resume Builder', 'https://help.huntr.co/en/articles/12824077-understanding-huntr-s-resume-builder', 'feature'), source('Huntr Help — Job Tracker', 'https://help.huntr.co/en/collections/10297189-job-tracker', 'feature')],
  },
  {
    slug: 'jobscan', vendor: 'Jobscan', description: 'A factual comparison of Jobscan and APWICO across resume-to-job analysis, job tracking and decision control.',
    strengths: ['Jobscan publishes a resume matcher that explains keyword comparison.', 'It publishes a free job tracker with application, schedule and contact organization.', 'Its public pages connect matching with job-search organization.'],
    boundaries: ['Jobscan describes match rate and keyword analysis; APWICO centers inspectable requirement-to-evidence rows.', 'No current numerical price is published here because a stable same-session official pricing record was not established.', 'Public pages do not prove private processing behavior or applicant outcomes.'],
    freeAccess: 'Jobscan’s public matcher and job-tracker pages describe free entry points; exact usage limits must be verified on the current product surface.',
    paidAccess: 'Current paid price and entitlement details are not established in this comparison. Follow Jobscan’s current purchase surface before deciding.',
    workflow: 'Jobscan connects matching and job tracking. APWICO adds an explicit pursue/skip/unsure decision and creates a separate job-specific resume without changing the master.',
    evidenceMethod: 'Jobscan publicly frames analysis through match rate and keyword breakdown. APWICO uses demonstrated, worth reviewing and not demonstrated states tied to source wording.',
    billing: 'Not established from a stable official pricing source during the 2026-09-30 review; no cadence or cancellation claim is inferred.',
    sources: [source('Jobscan — Resume Matcher', 'https://www.jobscan.co/resume-matcher', 'feature'), source('Jobscan — Job Tracker', 'https://www.jobscan.co/job-tracker', 'feature')],
  },
  {
    slug: 'resume-io', vendor: 'Resume.io', description: 'A factual comparison of Resume.io and APWICO across templates, free export, paid access and post-cancellation document access.',
    strengths: ['Resume.io publishes a broad builder and template workflow.', 'Its help center documents PDF and, for some templates, Word export.', 'Its billing and cancellation help articles state what happens after cancellation.'],
    boundaries: ['Resume.io says prices vary by location, so this page does not invent one global price.', 'Its free export is limited to a named template or text format according to the checked help source.', 'No private data-flow, ATS-success or hiring-outcome claim is inferred.'],
    freeAccess: 'The checked help page describes free resume building and free download using the Vancouver template or plain TXT.',
    paidAccess: 'Premium documentation describes unlimited resumes, cover letters and PDF downloads, with Word export available for some templates.',
    workflow: 'Resume.io focuses on document creation and templates. APWICO links the master document to job evidence, a user decision and a separate tailored version.',
    evidenceMethod: 'This comparison did not establish a public requirement-level evidence workflow in Resume.io. That means “not established,” not that no feature exists.',
    billing: 'Resume.io’s help center says the seven-day trial auto-renews, location affects price, and cancellation retains premium access until the end of the paid period; documents remain available afterward.',
    sources: [source('Resume.io Help — Premium features and pricing', 'https://help.resume.io/en/articles/3785856', 'pricing'), source('Resume.io Help — Free features', 'https://help.resume.io/en/articles/3785088', 'feature'), source('Resume.io Help — Billing', 'https://help.resume.io/en/articles/3785664', 'pricing'), source('Resume.io Help — Cancel a subscription', 'https://help.resume.io/en/articles/3784896', 'feature'), source('Resume.io Help — Export formats', 'https://help.resume.io/en/articles/3784704', 'feature')],
  },
  {
    slug: 'enhancv', vendor: 'Enhancv', description: 'A factual comparison of Enhancv and APWICO across design, content guidance, recurring access and post-cancellation editing.',
    strengths: ['Enhancv publishes multiple resume designs and customizable sections.', 'Its Pro documentation describes content suggestions and an ATS check.', 'Its help center states recurring plan and post-cancellation editing behavior.'],
    boundaries: ['The checked pricing page did not provide a stable locale-independent numerical price, so none is repeated here.', 'Vendor-described ATS checks are not treated as proof of hiring or system acceptance.', 'No private behavior or applicant outcome is inferred.'],
    freeAccess: 'The official pricing surface describes a seven-day free experience with branding and limits; verify current details on the live page.',
    paidAccess: 'Enhancv’s help article describes monthly, quarterly and semiannual Pro plans with resume/cover-letter features and content guidance.',
    workflow: 'Enhancv emphasizes document design and guidance. APWICO emphasizes requirement evidence, user authority and master/job-specific version separation.',
    evidenceMethod: 'Enhancv describes an ATS check and content suggestions. APWICO avoids a dominant ATS percentage and keeps source requirement, evidence and unknowns connected.',
    billing: 'The checked help article says plans recur automatically and that, after cancellation, existing documents can be downloaded but cannot be edited without resubscribing. Verify live terms at purchase.',
    sources: [source('Enhancv — Pricing', 'https://enhancv.com/pricing/', 'pricing'), source('Enhancv Help — Pro plans', 'https://help.enhancv.com/en/articles/1195346-understanding-the-enhancv-pro-plans', 'feature')],
  },
];

export const comparisonBySlug = new Map(comparisons.map(comparison => [comparison.slug, comparison]));
