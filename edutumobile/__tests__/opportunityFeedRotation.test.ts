import type { Opportunity } from '@edutu/core/src/types/opportunity';
import {
  createOpportunityRotationSeed,
  isOpenOpportunity,
  rotateOpportunityFeed,
} from '../lib/opportunityFeedRotation';

function opportunity(index: number, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: `opp-${index}`,
    title: `Opportunity ${index}`,
    organization: 'Edutu',
    category: 'Fellowship',
    location: 'Remote',
    description: 'A real opportunity',
    requirements: [],
    benefits: [],
    applicationProcess: [],
    deadline: '2099-12-31',
    createdAt: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    match: 100 - index,
    ...overrides,
  };
}

describe('opportunity feed rotation', () => {
  it('keeps every open opportunity exactly once and removes closed listings', () => {
    const rows = [
      opportunity(1),
      opportunity(2, { deadline: null }),
      opportunity(3, { deadline: '2020-01-01' }),
    ];

    const result = rotateOpportunityFeed(rows, 1234);

    expect(result.map((item) => item.id).sort()).toEqual(['opp-1', 'opp-2']);
    expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
    expect(isOpenOpportunity(rows[2])).toBe(false);
  });

  it('mixes newly published and long-tail opportunities into early windows', () => {
    const rows = Array.from({ length: 60 }, (_, index) => opportunity(index, {
      createdAt: new Date(Date.UTC(index >= 48 ? 2026 : 2024, 0, index + 1)).toISOString(),
    }));

    const firstWindow = rotateOpportunityFeed(rows, 98765).slice(0, 12);
    const indexes = firstWindow.map((item) => Number(item.id.replace('opp-', '')));

    expect(indexes.some((index) => index >= 48)).toBe(true);
    expect(indexes.some((index) => index >= 12)).toBe(true);
    expect(indexes.some((index) => index < 12)).toBe(true);
  });

  it('is stable for one session seed and rotates for a new seed', () => {
    const rows = Array.from({ length: 30 }, (_, index) => opportunity(index));
    const first = rotateOpportunityFeed(rows, 111).map((item) => item.id);
    const repeated = rotateOpportunityFeed(rows, 111).map((item) => item.id);
    const rotated = rotateOpportunityFeed(rows, 222).map((item) => item.id);

    expect(repeated).toEqual(first);
    expect(rotated).not.toEqual(first);
    expect(createOpportunityRotationSeed(123)).toBe(createOpportunityRotationSeed(123));
  });
});
