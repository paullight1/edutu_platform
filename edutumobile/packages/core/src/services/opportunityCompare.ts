/**
 * Opportunity Compare Utility
 *
 * Side-by-side comparison of up to 4 opportunities across
 * deadline, eligibility, award value, effort, location, fit, and documents.
 */

export interface CompareDimension {
  label: string;
  key: string;
  format: 'text' | 'date' | 'currency' | 'percentage' | 'boolean' | 'list';
  higherIsBetter?: boolean;
}

export interface CompareOpportunity {
  id: string;
  title: string;
  organization: string;
  deadline: string;
  stipend?: string | null;
  location: string;
  isRemote: boolean;
  category: string;
  matchScore?: number;
  eligibilitySummary?: string;
}

export const COMPARE_DIMENSIONS: CompareDimension[] = [
  { label: 'Deadline', key: 'deadline', format: 'date' },
  { label: 'Stipend / Award', key: 'stipend', format: 'currency', higherIsBetter: true },
  { label: 'Location', key: 'location', format: 'text' },
  { label: 'Remote', key: 'isRemote', format: 'boolean', higherIsBetter: true },
  { label: 'Category', key: 'category', format: 'text' },
  { label: 'Match Score', key: 'matchScore', format: 'percentage', higherIsBetter: true },
  { label: 'Eligibility', key: 'eligibilitySummary', format: 'text' },
];

export interface CompareResult {
  dimensions: CompareDimension[];
  opportunities: CompareOpportunity[];
  bestPerDimension: Record<string, string[]>; // dimension key → opportunity IDs
}

export function compareOpportunities(opportunities: CompareOpportunity[]): CompareResult {
  if (opportunities.length < 2) {
    throw new Error('Need at least 2 opportunities to compare');
  }

  if (opportunities.length > 4) {
    throw new Error('Maximum 4 opportunities can be compared at once');
  }

  const bestPerDimension: Record<string, string[]> = {};

  for (const dim of COMPARE_DIMENSIONS) {
    if (dim.format === 'date') {
      // Earlier deadline is better
      const sorted = [...opportunities].sort(
        (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
      );
      bestPerDimension[dim.key] = [sorted[0].id];
    } else if (dim.format === 'percentage' && dim.higherIsBetter) {
      const max = Math.max(...opportunities.map((o) => o.matchScore || 0));
      bestPerDimension[dim.key] = opportunities
        .filter((o) => (o.matchScore || 0) === max)
        .map((o) => o.id);
    } else if (dim.format === 'boolean' && dim.higherIsBetter) {
      bestPerDimension[dim.key] = opportunities
        .filter((o) => o.isRemote)
        .map((o) => o.id);
    }
  }

  return {
    dimensions: COMPARE_DIMENSIONS,
    opportunities,
    bestPerDimension,
  };
}

/**
 * Format a compare value for display.
 */
export function formatCompareValue(value: unknown, format: CompareDimension['format']): string {
  if (value === null || value === undefined) return '—';

  switch (format) {
    case 'date':
      return new Date(value as string).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    case 'currency':
      return String(value);
    case 'percentage':
      return `${value}%`;
    case 'boolean':
      return value ? '✅ Yes' : '❌ No';
    case 'list':
      return Array.isArray(value) ? (value as string[]).join(', ') : String(value);
    case 'text':
    default:
      return String(value);
  }
}
