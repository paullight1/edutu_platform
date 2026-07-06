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

  it('sends excludeOpportunityIds in the authenticated recommendations body', async () => {
    const { fetchOpportunities } = loadService();
    const supabase = {
      from: jest.fn(() => ({
        select: () => ({
          in: async () => ({ data: [], error: null }),
        }),
      })),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ opportunities: [] }),
    } as Response);

    await fetchOpportunities({
      supabase: supabase as never,
      userId: 'user-1',
      getAuthToken: async () => 'token-123',
      excludeOpportunityIds: ['opp-dismissed-1', 'opp-dismissed-2'],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.test/opportunities/recommendations',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body).toEqual(
      expect.objectContaining({
        limit: 50,
        minMatchScore: 0,
        excludeOpportunityIds: ['opp-dismissed-1', 'opp-dismissed-2'],
      }),
    );
  });

  it('sends excludeOpportunityIds in the unauthenticated query body and omits it when empty', async () => {
    const { fetchOpportunities } = loadService();
    const supabase = { from: jest.fn() };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ opportunities: [] }),
    } as Response);

    await fetchOpportunities({
      supabase: supabase as never,
      force: true,
      excludeOpportunityIds: ['opp-dismissed-1'],
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://api.example.test/opportunities/recommendations/query',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.excludeOpportunityIds).toEqual(['opp-dismissed-1']);

    await fetchOpportunities({
      supabase: supabase as never,
      force: true,
      excludeOpportunityIds: [],
    });

    const emptyBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(emptyBody).not.toHaveProperty('excludeOpportunityIds');
  });

  it('coerces object-shaped match_reasons into labels and preserves details', async () => {
    const { fetchOpportunities } = loadService();
    const supabase = { from: jest.fn() };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        opportunities: [
          {
            id: 'opp-object-reasons',
            title: 'Engine Fellowship',
            match_reasons: [
              { kind: 'field', label: 'Fits your field, Engineering', points: 1.5 },
              { kind: 'interest', label: 'Matches your interest in AI', points: 1 },
            ],
            match_risks: [{ label: 'Deadline is very close — apply soon' }],
          },
          {
            id: 'opp-details-field',
            title: 'Detailed Grant',
            match_reasons: ['Open to your country, Ghana'],
            match_reason_details: [
              { kind: 'location', label: 'Open to your country, Ghana', points: 1 },
            ],
          },
          {
            id: 'opp-string-reasons',
            title: 'Legacy Grant',
            match_reasons: ['Matches your interest in Data'],
            match_risks: ['Not a remote opportunity'],
          },
        ],
      }),
    } as Response);

    const [objectShaped, detailShaped, stringShaped] = await fetchOpportunities({
      supabase: supabase as never,
      force: true,
    });

    expect(objectShaped.matchReasons).toEqual([
      'Fits your field, Engineering',
      'Matches your interest in AI',
    ]);
    expect(objectShaped.matchReasonDetails).toEqual([
      { kind: 'field', label: 'Fits your field, Engineering', points: 1.5 },
      { kind: 'interest', label: 'Matches your interest in AI', points: 1 },
    ]);
    expect(objectShaped.matchRisks).toEqual(['Deadline is very close — apply soon']);

    expect(detailShaped.matchReasons).toEqual(['Open to your country, Ghana']);
    expect(detailShaped.matchReasonDetails).toEqual([
      { kind: 'location', label: 'Open to your country, Ghana', points: 1 },
    ]);

    expect(stringShaped.matchReasons).toEqual(['Matches your interest in Data']);
    expect(stringShaped.matchReasonDetails).toBeUndefined();
    expect(stringShaped.matchRisks).toEqual(['Not a remote opportunity']);
  });

  it('filters excluded ids locally on the Supabase fallback path', async () => {
    const { fetchOpportunities } = loadService();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    mockFetch.mockRejectedValue(new Error('network down'));

    const supabase = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [
                { id: 'opp-keep', title: 'Keep Me' },
                { id: 'opp-dismissed', title: 'Drop Me' },
              ],
              error: null,
            }),
          }),
        }),
      })),
    };

    const result = await fetchOpportunities({
      supabase: supabase as never,
      force: true,
      excludeOpportunityIds: ['opp-dismissed'],
    });

    expect(result.map((opportunity) => opportunity.id)).toEqual(['opp-keep']);
    consoleWarnSpy.mockRestore();
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
