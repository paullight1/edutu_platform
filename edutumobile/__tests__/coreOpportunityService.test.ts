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
      json: async () => ({ opportunities: [{ id: 'opp-any', title: 'Any' }] }),
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
        limit: 1000,
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
      json: async () => ({ opportunities: [{ id: 'opp-any', title: 'Any' }] }),
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

  it('guest query sends minMatchScore 0 and falls back to the catalog on an empty result', async () => {
    // Regression: the prod heuristic engine scores everything 20, so the old
    // guest floor of 30 returned an empty feed that was accepted and cached.
    const { fetchOpportunities } = loadService();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ opportunities: [] }),
    } as Response);

    const supabase = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [{ id: 'opp-catalog', title: 'Catalog Row' }],
              error: null,
            }),
          }),
        }),
      })),
    };

    const result = await fetchOpportunities({
      supabase: supabase as never,
      force: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.minMatchScore).toBe(0);
    expect(result.map((opportunity) => opportunity.id)).toEqual(['opp-catalog']);
  });

  // Regression: a signed-in user whose token is momentarily unavailable (cold
  // start, refresh in flight) used to fall straight through to the anonymous
  // endpoint, which scores on a different scale with no signals — so the same
  // user saw a different feed, and Best Shots blinked in and out between
  // launches. The token gets retried, and only a genuinely tokenless session
  // gives up.
  it('retries the auth token before abandoning the authenticated feed', async () => {
    const { fetchOpportunities } = loadService();
    const supabase = {
      from: jest.fn(() => ({
        select: () => ({ in: async () => ({ data: [], error: null }) }),
      })),
    };
    const getAuthToken = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('token-late');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        opportunities: [{ id: 'opp-auth', title: 'Authed Row' }],
      }),
    } as Response);

    const result = await fetchOpportunities({
      supabase: supabase as never,
      userId: 'user-1',
      getAuthToken,
      force: true,
    });

    expect(getAuthToken).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.example.test/opportunities/recommendations',
    );
    expect(result.map((o) => o.id)).toEqual(['opp-auth']);
  });

  it('serves a signed-in user their cached feed rather than anonymous scores', async () => {
    await mockAsyncStorage.setItem(
      'edutu_opportunities_cache:user-1',
      JSON.stringify([{ id: 'opp-cached', title: 'Cached Row', match: 71, matchFit: 71 }]),
    );

    const { fetchOpportunities } = loadService();
    const supabase = {
      from: jest.fn(() => ({
        select: () => ({ in: async () => ({ data: [], error: null }) }),
      })),
    };

    const result = await fetchOpportunities({
      supabase: supabase as never,
      userId: 'user-1',
      getAuthToken: async () => null,
      force: true,
    });

    // No anonymous request at all — the cached feed is the stable answer.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.map((o) => o.id)).toEqual(['opp-cached']);
  });

  // Regression: the home rail used to filter `featured` out of the ranked
  // recommendations feed, so an editorial pick that fell outside a user's
  // candidate window silently vanished from the section. Featured is an
  // editorial question, not a ranking one — it gets its own endpoint.
  it('fetches featured opportunities from the dedicated endpoint', async () => {
    const { fetchFeaturedOpportunities } = loadService();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'opp-featured',
          title: 'Spotlight Fellowship',
          is_featured: true,
          share_image_url: 'https://example.com/card.png',
        },
      ],
    } as Response);

    const result = await fetchFeaturedOpportunities(5);

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.example.test/opportunities/featured?limit=5',
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'opp-featured',
        title: 'Spotlight Fellowship',
        featured: true,
        image: 'https://example.com/card.png',
      }),
    ]);
  });

  it('returns an empty featured rail rather than throwing when the endpoint fails', async () => {
    const { fetchFeaturedOpportunities } = loadService();
    mockFetch.mockRejectedValueOnce(new Error('offline'));

    await expect(fetchFeaturedOpportunities()).resolves.toEqual([]);
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

  // The detail screen reads GET /opportunities/:id, which is @Public() and
  // therefore carries no user context — `match` comes back 0 and the fit panel
  // renders "Not ranked yet" forever, however complete the profile is. The
  // ranking has to be hydrated separately from the authenticated batch scorer.
  describe('fetchOpportunityRanking', () => {
    it('scores a single id against the signed-in user and maps the server shape', async () => {
      const { fetchOpportunityRanking } = loadService();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          scores: [
            {
              id: 'opp-1',
              match_score: 84,
              match_fit: 79,
              match_reasons: ['Matches your interest in Climate'],
              match_risks: ['Requires 2 years experience'],
              match_reason_details: [
                { kind: 'interest', label: 'Matches your interest in Climate', points: 20 },
              ],
            },
          ],
          count: 1,
          engine: 'hybrid_v2',
        }),
      } as Response);

      const ranking = await fetchOpportunityRanking('opp-1', async () => 'token-abc');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.test/opportunities/match-scores',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
          body: JSON.stringify({ opportunityIds: ['opp-1'] }),
        }),
      );
      expect(ranking).toEqual({
        match: 84,
        matchFit: 79,
        matchReasons: ['Matches your interest in Climate'],
        matchRisks: ['Requires 2 years experience'],
        matchReasonDetails: [
          { kind: 'interest', label: 'Matches your interest in Climate', points: 20 },
        ],
      });
    });

    it('returns null without a token, so guests are never scored anonymously', async () => {
      const { fetchOpportunityRanking } = loadService();

      await expect(fetchOpportunityRanking('opp-1', async () => null)).resolves.toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns null when the endpoint fails, leaving the unranked read intact', async () => {
      const { fetchOpportunityRanking } = loadService();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);

      await expect(fetchOpportunityRanking('opp-1', async () => 'token-abc')).resolves.toBeNull();
    });

    it('treats a zero score as no verdict rather than a "stretch" tier', async () => {
      const { fetchOpportunityRanking } = loadService();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scores: [{ id: 'opp-1', match_score: 0 }] }),
      } as Response);

      await expect(fetchOpportunityRanking('opp-1', async () => 'token-abc')).resolves.toBeNull();
    });
  });
});
