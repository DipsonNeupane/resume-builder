import { freeTemplates, premiumTemplates } from '../model';
import { freeDownloadsSummary, launchFacts } from './launchFacts';

export type CommercialPlanId = 'free' | 'pro';

export type CommercialPlan = {
 id: CommercialPlanId;
 name: string;
 price: string;
 cadence: string;
 recurring: boolean;
 summary: string;
 includes: readonly string[];
 action: { label: string; href: string };
};

/**
 * Public commercial facts must come from implemented entitlement, checkout and
 * export behavior. Keep aspirational benefits, customer outcomes and provider
 * marketing out of this boundary.
 */
export const commercialPlans: readonly CommercialPlan[] = [
 {
  id: 'free', name: 'Free', price: '$0', cadence: 'No subscription', recurring: false,
  summary: 'Build a resume, find jobs and track applications for free.',
  includes: [`Resume builder and ${freeTemplates.length} free templates`, 'Match a pasted job in your browser', `${launchFacts.freeManualRefreshes.count} searches per ${launchFacts.freeManualRefreshes.windowHours} hours · up to ${launchFacts.freeResultsPerRefresh} results each`, 'Optional daily refresh', `Track up to ${launchFacts.freeApplications} applications`, `Tailor one resume for one job · up to ${launchFacts.freeTrialAiRuns} suggestions`, `${launchFacts.freeDownloads.count} PDF or Word downloads per ${launchFacts.freeDownloads.windowDays} days`],
  action: { label: 'Start for free', href: '/start/build' },
 },
 {
  id: 'pro', name: 'Pro', price: launchFacts.proMonthlyPrice, cadence: 'per month', recurring: true,
  summary: `${launchFacts.proTrialDays} days free, then ${launchFacts.proMonthlyPrice}/month. Get full match details and a separate resume for each job.`,
  includes: [`All ${freeTemplates.length + premiumTemplates.length} resume templates`, 'Full match details', `Up to ${launchFacts.proResultsPerSearch} results per search`, 'A separate resume for each job', 'Review and edit resume suggestions', 'PDF and Word downloads'],
  action: { label: 'Explore Pro', href: '/workspace/pro' },
 },
] as const;

export const commercialPolicy = {
 territory: 'New paid subscriptions are currently available only in the United States.',
 currency: 'All current subscription prices are presented and charged in United States dollars (USD). No local-currency price is promised.',
 paymentMethods: 'Stripe Checkout shows only payment methods enabled for the configured account and compatible with the buyer, device, USD price and subscription. APWICO does not promise a particular method before checkout displays it.',
 taxesAndInvoices: 'Review any taxes, currency conversion, invoice, and receipt details in Stripe Checkout before paying. Tax-inclusive pricing and invoice availability are not promised.',
 refunds: 'Purchases are generally non-refundable except where mandatory consumer, unauthorized-charge, duplicate-charge or non-supply rights apply. The terms and refund policy control.',
 renewal: `Pro starts with a ${launchFacts.proTrialDays}-day free trial, then renews at ${launchFacts.proMonthlyPrice} monthly until cancelled. Cancel before the trial ends to avoid the monthly charge.`,
 proTrial: `Pro is free for ${launchFacts.proTrialDays} days, then ${launchFacts.proMonthlyPrice} per month. Checkout collects a payment method; cancel before the trial ends to avoid the monthly charge.`,
 cancellation: 'Cancellation stops future renewal. Paid access continues through the current billing period.',
 proLimits: `Pro is not unlimited: up to ${launchFacts.proApplicationCeiling.toLocaleString('en-US')} tracked applications, up to ${launchFacts.proResultsPerSearch} results per job search, fair-use downloads, and up to ${launchFacts.aiRequestsPerHour} tailoring requests per hour per account. Resume suggestions may pause when the monthly service budget is reached; other features keep working.`,
 freeTrial: `The Free tailoring trial covers the first application you prepare with it, including up to ${launchFacts.freeTrialAiRuns} successful tailoring suggestion runs. Failed runs do not count, and the trial does not renew.`,
 dataAccess: `Your resumes, job-specific versions, application records and kept document copies stay in your account on Free and Pro and after Pro ends. Above the Free limit of ${launchFacts.freeApplications} applications, every existing record stays available to open, edit, export as CSV and remove; only adding new ones waits.`,
 templateAfterCancellation: 'After Pro ends, Premium designs remain available to preview, but new downloads in a Premium design require active Pro. Resume content and application records are not deleted, and files already downloaded remain yours.',
 pdf: 'PDF preserves the selected resume design.',
 docx: 'Word (.docx) is a clean, editable content document; it does not promise visual parity with the PDF template.',
 freeDownloads: `Free includes ${launchFacts.freeDownloads.count} successful PDF or Word downloads in a rolling ${launchFacts.freeDownloads.windowDays}-day window. Both formats share the allowance; failed downloads do not count, and each counted download leaves the window ${launchFacts.freeDownloads.windowDays} days after it started.`,
 paidDownloads: 'Pro includes fair-use downloads for every template. Server size and abuse limits apply.',
 exportBoundary: 'Downloads require a signed-in account and explicit consent to send the current resume to APWICO for server generation. The generated file is not kept. When you export a job-specific version and choose to keep it with its application, the exact resume content is stored in your account so you can retrieve what you submitted.',
 outcomes: 'No plan or template promises ATS passage, interviews, job offers, or hiring outcomes.',
 checkout: 'Previewing a template does not start checkout. A recurring paid action requires an explicit consent checkbox before Stripe checkout opens.',
} as const;

export type CustomerProof = {
 id: string;
 quote: string;
 context: string;
 consentRecordedAt: string;
 factsVerifiedAt: string;
 consentScope: 'public_quote' | 'public_case_study';
 consentReference: string;
 moderatedAt: string;
 publishedAt: string;
 withdrawnAt: string | null;
 withdrawalContact: string;
};

/**
 * Intentionally empty until a real customer explicitly consents and the story's
 * factual context is reviewed. The renderer omits proof UI when this list is empty.
 */
export const customerProof: readonly CustomerProof[] = [];

const publicCopyContact = /(?:https?:\/\/|www\.|\S+@\S+|(?:\+?\d[\s().-]*){7,}\d)/i;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

export function publishableCustomerProof(entries: readonly CustomerProof[], today = new Date()): readonly CustomerProof[] {
 const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
 return entries.filter(proof => {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(proof.id)) throw new Error(`Invalid customer-proof id: ${proof.id}`);
  if (!/^proof-consent-[a-z0-9-]{8,80}$/.test(proof.consentReference)) throw new Error(`Customer proof ${proof.id} lacks a bounded consent reference.`);
  if (!proof.quote.trim() || proof.quote.length > 600 || !proof.context.trim() || proof.context.length > 300) throw new Error(`Customer proof ${proof.id} exceeds bounded public copy limits.`);
  if (publicCopyContact.test(`${proof.quote} ${proof.context}`)) throw new Error(`Customer proof ${proof.id} contains a URL or contact detail.`);
  const days = [proof.consentRecordedAt, proof.factsVerifiedAt, proof.moderatedAt, proof.publishedAt];
  if (days.some(value => !isoDay.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)))) throw new Error(`Customer proof ${proof.id} has an invalid lifecycle date.`);
  const stamps = days.map(value => Date.parse(`${value}T00:00:00Z`));
  if (stamps.some(value => value > todayMs) || stamps.some((value, index) => index > 0 && value < stamps[index - 1])) throw new Error(`Customer proof ${proof.id} has an invalid lifecycle order.`);
  if (proof.withdrawnAt !== null && (!isoDay.test(proof.withdrawnAt) || !Number.isFinite(Date.parse(`${proof.withdrawnAt}T00:00:00Z`)))) throw new Error(`Customer proof ${proof.id} has an invalid withdrawal date.`);
  if (proof.withdrawalContact !== 'support@apwico.com') throw new Error(`Customer proof ${proof.id} needs the verified withdrawal contact.`);
  return proof.withdrawnAt === null;
 });
}
