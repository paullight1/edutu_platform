import { fetchMarketplaceEntitlements } from '../marketplaceEntitlements';

describe('fetchMarketplaceEntitlements', () => {
  it('returns buyer-scoped marketplace access and preserves only safe http(s) links', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'enrollment-1',
          listingId: 'listing-1',
          status: 'active',
          creditsSpent: 120,
          enrolledAt: '2026-08-21T08:00:00.000Z',
          completedAt: null,
          title: 'Scholarship clinic',
          category: 'mentorship',
          type: 'paid',
          imageUrl: null,
          accessUrl: 'https://example.com/booking',
        },
        {
          id: 'legacy-unsafe',
          listingId: 'listing-2',
          status: 'active',
          creditsSpent: 0,
          enrolledAt: '2026-08-21T08:00:00.000Z',
          completedAt: null,
          title: 'Legacy row',
          category: 'course',
          type: 'course',
          imageUrl: null,
          accessUrl: 'javascript:alert(1)',
        },
      ],
    });

    const result = await fetchMarketplaceEntitlements({
      token: 'session-token',
      baseUrl: 'https://api.edutu.test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.edutu.test/marketplace/enrollments',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
        }),
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].accessUrl).toBe('https://example.com/booking');
    expect(result[1].accessUrl).toBeNull();
  });

  it('fails with the backend message instead of silently showing an empty entitlement list', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Session expired' }),
    });

    await expect(
      fetchMarketplaceEntitlements({
        token: 'expired-token',
        baseUrl: 'https://api.edutu.test/',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toThrow('Session expired');
  });
});
