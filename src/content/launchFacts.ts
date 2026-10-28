/** Launch allowance facts shared by product copy, client checks and server code.
 *
 * The database enforces the same numbers (`document_begin`/`pdf_status` and the
 * `product_settings` row); tests/server/launch-facts.test.ts fails if a migration,
 * public page or this file disagree. Legally reviewed prose (terms/privacy) states the
 * numbers explicitly and is checked by the same test rather than templated. */
export const launchFacts = {
 freeDownloads: { count: 7, windowDays: 7 },
 freeApplications: 100,
 freeTailoringTrials: 1,
 freeManualRefreshes: { count: 3, windowHours: 24 },
 freeResultsPerRefresh: 10,
 proMonthlyPrice: 'US$14.99',
 /** Pro ceilings: `applications_owner_limit`, PRO_JOB_LIMIT and `begin_ai_request`. */
 proApplicationCeiling: 10000,
 proResultsPerSearch: 20,
 aiRequestsPerHour: 20,
 freeTrialAiRuns: 3,
 paidTerritory: 'United States',
} as const;

export const freeDownloadsSummary = `${launchFacts.freeDownloads.count} successful PDF or Word downloads per rolling ${launchFacts.freeDownloads.windowDays} days`;
