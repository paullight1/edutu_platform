import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_UNAVAILABLE_REASON,
  getAnalyticsData,
  recordOpportunityExploreAggregate,
  syncOpportunityInventorySnapshot,
} from './analyticsAggregator';

describe('analyticsAggregator unavailable semantics', () => {
  it('never reports a synthetic successful write', async () => {
    const result = await recordOpportunityExploreAggregate({
      id: 'opp-1',
      title: 'Scholarship',
    });

    expect(result).toMatchObject({
      success: false,
      available: false,
      reason: ANALYTICS_UNAVAILABLE_REASON,
    });
  });

  it('preserves the timestamp contract without claiming persistence', async () => {
    const result = await syncOpportunityInventorySnapshot([]);

    expect(result.success).toBe(false);
    expect(result.available).toBe(false);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('marks read aggregates as unavailable instead of silently presenting zeroes as real data', async () => {
    const result = await getAnalyticsData('user-1', {
      start: new Date('2026-08-01T00:00:00.000Z'),
      end: new Date('2026-08-20T00:00:00.000Z'),
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe(ANALYTICS_UNAVAILABLE_REASON);
  });
});
