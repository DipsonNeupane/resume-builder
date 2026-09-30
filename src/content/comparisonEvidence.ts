export type ComparisonEvidence = {
  vendor: string;
  fact: string;
  sourceUrl: string;
  locale: string;
  currency: string | null;
  checkedAt: `${number}-${number}-${number}`;
  nextReviewAt: `${number}-${number}-${number}`;
  kind: 'pricing' | 'feature';
  publishable: boolean;
};

// Research ledger only. `publishable` remains false until a named comparison
// receives complete, same-session review across every material dimension.
export const comparisonEvidence: ComparisonEvidence[] = [
  {
    vendor: 'Teal',
    fact: 'The official US pricing page displayed Free and recurring Teal+ weekly, 30-day and 90-day options; its page separately described free and paid feature limits.',
    sourceUrl: 'https://www.tealhq.com/pricing',
    locale: 'United States / English',
    currency: 'USD',
    checkedAt: '2026-09-30',
    nextReviewAt: '2026-10-30',
    kind: 'pricing',
    publishable: false,
  },
  {
    vendor: 'Teal',
    fact: 'The official help collection documented its resume builder, job matcher, import, analysis and export help topics.',
    sourceUrl: 'https://help.tealhq.com/en/collections/9568976-resume-builder',
    locale: 'English',
    currency: null,
    checkedAt: '2026-09-30',
    nextReviewAt: '2026-12-29',
    kind: 'feature',
    publishable: false,
  },
];

export const comparisonResearchQueue = [
  { vendor: 'Huntr', officialUrl: 'https://huntr.co/pricing' },
  { vendor: 'Jobscan', officialUrl: 'https://www.jobscan.co/pricing' },
  { vendor: 'Resume.io', officialUrl: 'https://resume.io/pricing' },
  { vendor: 'Enhancv', officialUrl: 'https://enhancv.com/pricing/' },
] as const;

