import { comparisons, evidenceIsCurrent } from './comparisons';

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

// The detailed pages are the source of truth. This flattened ledger keeps
// freshness checks machine-readable without inventing locale-specific prices.
export const comparisonEvidence: ComparisonEvidence[] = comparisons.flatMap(comparison => comparison.sources.map(item => ({
  vendor: comparison.vendor,
  fact: item.label,
  sourceUrl: item.url,
  locale: item.locale,
  currency: item.currency,
  checkedAt: item.checkedAt,
  nextReviewAt: item.nextReviewAt,
  kind: item.kind,
  publishable: evidenceIsCurrent(item.nextReviewAt),
})));

export const comparisonResearchQueue: ReadonlyArray<{ vendor: string; officialUrl: string }> = [];
