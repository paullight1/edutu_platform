const mockFetch = jest.fn();
const API_BASE = 'https://api.example.test';
const getAuthToken = async () => 'test-token';

function loadService() {
  process.env.EXPO_PUBLIC_API_URL = API_BASE;
  return require('../packages/core/src/services/communityDms') as typeof import('../packages/core/src/services/communityDms');
}

function response(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body };
}

beforeEach(() => {
  jest.resetModules();
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('community DMs service contract', () => {
  it('creates a request through the isolated endpoint', async () => {
    mockFetch.mockResolvedValue(response(true, 200, { conversation: { id: 'dm-1', status: 'pending' } }));
    const { createDmRequest } = loadService();

    await createDmRequest('user_ben', 'Hello', getAuthToken);

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/community-dms/requests`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: JSON.stringify({ recipientId: 'user_ben', body: 'Hello' }),
      }),
    );
  });

  it('forwards the stable two-part keyset cursor for history', async () => {
    mockFetch.mockResolvedValue(response(true, 200, []));
    const { fetchDmMessages } = loadService();

    await fetchDmMessages(
      '11111111-1111-4111-8111-111111111111',
      {
        before: '2026-08-01T10:00:00.000Z',
        beforeId: '22222222-2222-4222-8222-222222222222',
        limit: 40,
      },
      getAuthToken,
    );

    expect(mockFetch.mock.calls[0][0]).toBe(
      `${API_BASE}/community-dms/conversations/11111111-1111-4111-8111-111111111111/messages?before=2026-08-01T10%3A00%3A00.000Z&beforeId=22222222-2222-4222-8222-222222222222&limit=40`,
    );
  });

  it('surfaces the backend sentence for a pending-sender refusal', async () => {
    mockFetch.mockResolvedValue(response(false, 409, { message: 'Your message request is still waiting for a response.' }));
    const { createDmRequest } = loadService();

    await expect(createDmRequest('user_ben', 'Again', getAuthToken)).rejects.toMatchObject({
      status: 409,
      message: 'Your message request is still waiting for a response.',
    });
  });
});
