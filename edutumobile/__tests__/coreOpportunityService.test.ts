const mockStorage = new Map<string, string>();
const mockFetch = jest.fn();

const mockAsyncStorage = {
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
  getAllKeys: jest.fn(async () => Array.from(mockStorage.keys())),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

function loadService() {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
  return require('../packages/core/src/services/opportunities') as typeof import('../packages/core/src/services/opportunities');
}

describe('core opportunity service contract', () => {
  beforeEach(() => {
    jest.resetModules();
    mockStorage.clear();
    mockFetch.mockReset();
    mockAsyncStorage.getItem.mockClear();
    mockAsyncStorage.setItem.mockClear();
    mockAsyncStorage.removeItem.mockClear();
    mockAsyncStorage.getAllKeys.mockClear();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  it('reads and returns a cached opportunity snapshot for a user', async () => {
    await mockAsyncStorage.setItem(
      'edutu_opportunities_cache:user-1',
      JSON.stringify([
        {
          id: 'opp-cache',
          title: 'Cached Scholarship',
          organization: 'Edutu',
        },
      ]),
    );

    const { getCachedOpportunitiesSnapshot } = loadService();

    await expect(getCachedOpportunitiesSnapshot('user-1')).resolves.toEqual([
      {
        id: 'opp-cache',
        title: 'Cached Scholarship',
        organization: 'Edutu',
      },
    ]);
  });

  it('fetches authenticated recommendations, normalizes them, and persists the cache', async () => {
    const { fetchOpportunities, getCachedOpportunitiesSnapshot } = loadService();
    const onSyncSnapshot = jest.fn().mockResolvedValue(undefined);
    const supabase = {
      from: jest.fn(() => ({
        select: () => ({
          in: async () => ({ data: [], error: null }),
        }),
      })),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        opportunities: [
          {
            id: 'opp-api',
            title: 'Global Fellowship',
            organization: 'World Program',
            category: 'Fellowship',
            location: 'Remote',
            description: 'Join the fellowship cohort.',
            deadline: '2030-04-01T00:00:00.000Z',
            image_url: 'https://example.com/fellowship.png',
            application_url: 'https://example.com/apply',
            is_featured: true,
          },
        ],
      }),
    } as Response);

    const result = await fetchOpportunities({
      supabase: supabase as never,
      userId: 'user-1',
      getAuthToken: async () => 'token-123',
      onSyncSnapshot,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.test/opportunities/recommendations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'opp-api',
          title: 'Global Fellowship',
          organization: 'World Program',
          location: 'Remote',
          applyUrl: 'https://example.com/apply',
        }),
      ]),
    );

    expect(onSyncSnapshot).toHaveBeenCalledWith(result);
    await expect(getCachedOpportunitiesSnapshot('user-1')).resolves.toEqual(result);
  });

  it('normalizes a single opportunity lookup and returns null when the row is missing', async () => {
    const opportunityRow = {
      id: 'opp-lookup',
      title: 'Scholarship Award',
      organization: 'Edutu',
      category: 'Scholarship',
      location: 'Lagos',
      description: 'A funded scholarship opportunity.',
      requirements: ['Transcript'],
      benefits: ['Stipend'],
      application_process: ['Apply online'],
      application_url: 'https://example.com/lookup',
      image_url: 'https://example.com/lookup.png',
      updated_at: '2026-06-22T00:00:00.000Z',
    };

    const supabase = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: opportunityRow, error: null }),
          }),
        }),
      })),
    };

    const { getOpportunity } = loadService();
    const opportunity = await getOpportunity('opp-lookup', supabase as never);

    expect(opportunity).toEqual(
      expect.objectContaining({
        id: 'opp-lookup',
        title: 'Scholarship Award',
        organization: 'Edutu',
        category: 'Scholarship',
        location: 'Lagos',
        applyUrl: 'https://example.com/lookup',
      }),
    );

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const missingSupabase = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error('No data found') }),
          }),
        }),
      })),
    };

    await expect(getOpportunity('opp-missing', missingSupabase as never)).resolves.toBeNull();
    consoleErrorSpy.mockRestore();
  });
});
