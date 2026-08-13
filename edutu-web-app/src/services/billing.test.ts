import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as billing from './billing';
import { createCheckout } from './billing';

type CheckoutCreator = (
  token: string,
  input: { productKey: string; returnSurface: 'web'; idempotencyKey: string },
) => Promise<unknown>;

const createBachsCheckout = createCheckout as unknown as CheckoutCreator;

function checkoutResponse(checkoutUrl = 'https://checkout.bachs.io/session/session_123') {
  return {
    intentId: 'intent_123',
    checkoutUrl,
    expiresAt: '2026-08-11T12:00:00.000Z',
    renewalMode: 'one_time',
  };
}

describe('createCheckout', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACHS_CHECKOUT_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts only a product key and surface with the action idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(checkoutResponse()), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createBachsCheckout('clerk-token', {
      productKey: 'pro_monthly_pass',
      returnSurface: 'web',
      idempotencyKey: 'd2719a52-ef21-4d8b-a53a-82ba4ea7542b',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.edutu.test/billing/checkout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer clerk-token',
          'Idempotency-Key': 'd2719a52-ef21-4d8b-a53a-82ba4ea7542b',
        }),
        body: JSON.stringify({ productKey: 'pro_monthly_pass', returnSurface: 'web' }),
      }),
    );

    const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
    expect([...requestedUrl.searchParams.keys()]).toEqual([]);
  });

  it('blocks a checkout URL outside the documented Bachs checkout origin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(checkoutResponse('https://checkout.bachs.io.attacker.test/session')), {
          status: 200,
        }),
      ),
    );

    await expect(
      createBachsCheckout('clerk-token', {
        productKey: 'pro_monthly_pass',
        returnSurface: 'web',
        idempotencyKey: 'd2719a52-ef21-4d8b-a53a-82ba4ea7542b',
      }),
    ).rejects.toThrow('trusted Bachs checkout URL');
  });

  it('blocks a checkout URL with credentials even when its origin matches Bachs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(checkoutResponse('https://user:pass@checkout.bachs.io/session')), {
          status: 200,
        }),
      ),
    );

    await expect(
      createBachsCheckout('clerk-token', {
        productKey: 'pro_monthly_pass',
        returnSurface: 'web',
        idempotencyKey: 'b6c8a3f1-8056-4bbc-8a92-d7b6b20bc2ef',
      }),
    ).rejects.toThrow('trusted Bachs checkout URL');
  });

  it('does not request checkout while Bachs is disabled by default', async () => {
    vi.stubEnv('VITE_BACHS_CHECKOUT_ENABLED', 'false');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createBachsCheckout('clerk-token', {
        productKey: 'pro_monthly_pass',
        returnSurface: 'web',
        idempotencyKey: 'd2719a52-ef21-4d8b-a53a-82ba4ea7542b',
      }),
    ).rejects.toThrow('not ready');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('coalesces duplicate checkout requests for the same action idempotency key', async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const input = {
      productKey: 'pro_monthly_pass',
      returnSurface: 'web' as const,
      idempotencyKey: 'd2719a52-ef21-4d8b-a53a-82ba4ea7542b',
    };
    const first = createBachsCheckout('clerk-token', input);
    const duplicate = createBachsCheckout('clerk-token', input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse?.(new Response(JSON.stringify(checkoutResponse()), { status: 200 }));
    await expect(Promise.all([first, duplicate])).resolves.toHaveLength(2);
  });
});

describe('management destinations', () => {
  it('uses only provider-owned destinations and never a remotely configured URL', () => {
    const getManageDestination = (
      billing as typeof billing & {
        getManageDestination?: (provider: string) => unknown;
      }
    ).getManageDestination;

    expect(getManageDestination).toBeTypeOf('function');
    if (!getManageDestination) return;

    expect(getManageDestination('bachs')).toEqual({ kind: 'portal-session' });
    expect(getManageDestination('revenuecat_app_store')).toEqual({
      kind: 'external',
      url: 'https://apps.apple.com/account/subscriptions',
    });
    expect(getManageDestination('revenuecat_play_store')).toEqual({
      kind: 'external',
      url: 'https://play.google.com/store/account/subscriptions',
    });
    expect(getManageDestination('one_time_pass')).toEqual({ kind: 'none' });
    expect(getManageDestination('https://attacker.test/manage')).toEqual({ kind: 'none' });
  });
});
