import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getApplications } from './applications';
describe('application request budget', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    vi.stubEnv('VITE_BACKEND_URL', 'https://api.example.test');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('surfaces a database outage after one attempt so the learner can retry explicitly', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ message: 'Storage unavailable' }), {
            status: 503,
          }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(getApplications('user-1', 'token')).rejects.toMatchObject({
      status: 503,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('classifies an unreachable API as a connection failure rather than claiming the device is offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(getApplications('user-1', 'token')).rejects.toThrow(
      /connect/i,
    );
  });
});
