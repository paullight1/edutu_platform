import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProStatus } from '../packages/core/src/hooks/useProStatus';

jest.mock('@edutu/core/src/services/payments', () => ({
  initRevenueCat: jest.fn(async () => false),
  isProSubscriber: jest.fn(async () => false),
  getActiveEntitlements: jest.fn(async () => []),
}));

jest.mock('@edutu/core/src/utils/auth', () => ({
  toSafeUUID: (value: string) => `legacy-${value}`,
}));

type Entitlement = { feature_key: string; status: string; expires_at: string | null };

function createSupabase(entitlements: () => Entitlement[]) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        const query = {
          select: jest.fn(() => query),
          in: jest.fn(async () => ({
            data: [{
              user_id: 'user_1',
              is_pro: true,
              pro_since: '2026-08-12T00:00:00.000Z',
              pro_expires_at: '2026-09-12T00:00:00.000Z',
              subscription_id: 'sub_1',
            }],
          })),
        };
        return query;
      }

      let eqCount = 0;
      let inCount = 0;
      const query = {
        select: jest.fn(() => query),
        eq: jest.fn(() => {
          eqCount += 1;
          return eqCount === 2
            ? Promise.resolve({ data: entitlements(), error: null })
            : query;
        }),
        in: jest.fn(() => {
          inCount += 1;
          return inCount === 2
            ? Promise.resolve({ data: entitlements(), error: null })
            : query;
        }),
      };
      return query;
    }),
    getChannels: jest.fn(() => []),
    channel: jest.fn(() => {
      const channel = {
        on: jest.fn(() => channel),
        subscribe: jest.fn(() => channel),
      };
      return channel;
    }),
    removeChannel: jest.fn(async () => undefined),
  };
}

describe('server Pro fulfillment', () => {
  it('does not confirm a purchase from the compatibility profile mirror', async () => {
    let rows: Entitlement[] = [];
    const supabase = createSupabase(() => rows);
    const { result } = renderHook(() => useProStatus(supabase as any, 'user_1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.refreshServerStatus()).resolves.toBe(false);
    });

    rows = [{ feature_key: 'pro', status: 'active', expires_at: null }];
    await act(async () => {
      await expect(result.current.refreshServerStatus()).resolves.toBe(true);
    });
  });
});
