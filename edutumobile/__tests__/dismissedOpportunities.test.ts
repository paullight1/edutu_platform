const mockStorage = new Map<string, string>();

const mockAsyncStorage = {
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

const {
  addDismissedOpportunityId,
  clearDismissedOpportunityIds,
  getDismissedOpportunityIds,
} = require('../packages/core/src/services/dismissedOpportunities') as typeof import('../packages/core/src/services/dismissedOpportunities');
const { toSafeUUID } = require('../packages/core/src/utils/auth') as typeof import('../packages/core/src/utils/auth');

describe('dismissedOpportunities service', () => {
  beforeEach(() => {
    mockStorage.clear();
    mockAsyncStorage.getItem.mockClear();
    mockAsyncStorage.setItem.mockClear();
    mockAsyncStorage.removeItem.mockClear();
  });

  it('stores dismissed ids under a per-user safe-UUID key', async () => {
    await addDismissedOpportunityId('user_clerk-123', 'opp-1');

    const expectedKey = `edutu_dismissed_opportunities:${toSafeUUID('user_clerk-123')}`;
    expect(mockStorage.has(expectedKey)).toBe(true);
    await expect(getDismissedOpportunityIds('user_clerk-123')).resolves.toEqual(['opp-1']);
  });

  it('keeps users isolated and returns [] for unknown or empty users', async () => {
    await addDismissedOpportunityId('user-a', 'opp-a');

    await expect(getDismissedOpportunityIds('user-b')).resolves.toEqual([]);
    await expect(getDismissedOpportunityIds('')).resolves.toEqual([]);
  });

  it('dedupes re-dismissed ids by moving them to the newest slot', async () => {
    await addDismissedOpportunityId('user-1', 'opp-1');
    await addDismissedOpportunityId('user-1', 'opp-2');
    await addDismissedOpportunityId('user-1', 'opp-1');

    await expect(getDismissedOpportunityIds('user-1')).resolves.toEqual(['opp-2', 'opp-1']);
  });

  it('caps the set at 200 ids with FIFO eviction', async () => {
    const seeded = Array.from({ length: 200 }, (_, index) => `opp-${index}`);
    mockStorage.set(
      `edutu_dismissed_opportunities:${toSafeUUID('user-1')}`,
      JSON.stringify(seeded),
    );

    await addDismissedOpportunityId('user-1', 'opp-newest');

    const ids = await getDismissedOpportunityIds('user-1');
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe('opp-1');
    expect(ids).not.toContain('opp-0');
    expect(ids[ids.length - 1]).toBe('opp-newest');
  });

  it('clears the set and survives corrupt storage payloads', async () => {
    await addDismissedOpportunityId('user-1', 'opp-1');
    await clearDismissedOpportunityIds('user-1');
    await expect(getDismissedOpportunityIds('user-1')).resolves.toEqual([]);

    mockStorage.set(`edutu_dismissed_opportunities:${toSafeUUID('user-1')}`, 'not-json');
    await expect(getDismissedOpportunityIds('user-1')).resolves.toEqual([]);
  });
});
