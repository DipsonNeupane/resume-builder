import { freeTemplates, premiumTemplates } from '../model';

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
  summary: `Build with all ${freeTemplates.length} Free templates, review evidence, and organize a focused job search.`,
  includes: [`All ${freeTemplates.length} Free templates`, 'Browser-only evidence checker', 'Up to 10 relevant results per refresh; 3 manual refreshes per rolling 24 hours', 'Optional fresh automatic refresh about every 24 hours', 'Save and track up to 10 applications', '7 successful PDF or Word downloads per rolling 7 days'],
  action: { label: 'Start with Free', href: '/start/build' },
 },
 {
  id: 'pro', name: 'Pro', price: 'US$14.99', cadence: 'per month', recurring: true,
  summary: 'Unlock every Premium template, expanded job search, full Match Analysis, and job-specific tailoring.',
  includes: [`All ${freeTemplates.length + premiumTemplates.length} templates`, 'Full requirement-level Match Analysis', 'Up to 20 job results per search without the Free daily search limit', 'A separate resume for each saved job', 'AI suggestions you accept, reject or edit', 'Fair-use PDF and editable Word downloads while access is active'],
  action: { label: 'Review Pro in workspace', href: '/workspace/pro' },
 },
] as const;

export const commercialPolicy = {
 territory: 'New paid subscriptions are currently available only in the United States.',
 currency: 'All current subscription prices are presented and charged in United States dollars (USD). No local-currency price is promised.',
 paymentMethods: 'Stripe Checkout shows only payment methods enabled for the configured account and compatible with the buyer, device, USD price and subscription. APWICO does not promise a particular method before checkout displays it.',
 taxesAndInvoices: 'Review any taxes, currency conversion, invoice, and receipt details in Stripe Checkout before paying.',
 refunds: 'Purchases are generally non-refundable except where mandatory consumer, unauthorized-charge, duplicate-charge or non-supply rights apply. The terms and refund policy control.',
 renewal: 'Paid subscriptions renew monthly until cancelled.',
 cancellation: 'Cancellation stops future renewal. Paid access continues through the current billing period.',
 templateAfterCancellation: 'After an individual Premium-template subscription expires, the design remains available to preview, but new downloads in that Premium design require active access. Resume content is not deleted, and files already downloaded remain yours.',
 proOverlap: 'When a Pro purchase succeeds, future renewals for active individual-template subscriptions are stopped. Their already-paid access continues through each paid period.',
 pdf: 'PDF preserves the selected resume design.',
 docx: 'Word (.docx) is a clean, editable content document; it does not promise visual parity with the PDF template.',
 freeDownloads: 'Free includes 7 successful PDF or Word downloads in a rolling 7-day window. Both formats share the allowance; each successful download leaves the window seven days after it occurred.',
 paidDownloads: 'Pro includes fair-use downloads for every template. Server size and abuse limits apply. Existing individual-template subscriptions retain their original access while active, but are no longer sold to new customers.',
 exportBoundary: 'Downloads require a signed-in account and explicit consent to send the current resume to APWICO for server generation. The export routes do not intentionally keep the resume or generated file as a separate permanent server copy.',
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
