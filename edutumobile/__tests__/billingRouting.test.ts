import {
  getPaymentRail,
  isBachsCheckoutEnabled,
  requestBachsCheckout,
  requestBachsPortalSession,
  visibleBillingPlans,
  webProductKeyForPlan,
  webProductKeyForCredit,
} from '../lib/billingRouting';

const enabledConfig = {
  enabled: true,
  apiBaseUrl: 'https://api.edutu.org',
};

describe('Bachs web billing requests', () => {
  it('posts only a server-owned product key to the authenticated checkout endpoint', async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        checkoutUrl: 'https://checkout.bachs.io/session/session-123',
        intentId: 'intent-123',
        expiresAt: '2026-08-11T12:00:00.000Z',
      }),
    });

    await expect(requestBachsCheckout({
      accessToken: 'clerk-session-token',
      productKey: 'pro_monthly_pass',
      idempotencyKey: 'd6ef9070-9172-4c4c-9c8b-1a0aef78c214',
      config: enabledConfig,
      request,
    })).resolves.toEqual({
      checkoutUrl: 'https://checkout.bachs.io/session/session-123',
      intentId: 'intent-123',
      expiresAt: '2026-08-11T12:00:00.000Z',
    });

    expect(request).toHaveBeenCalledWith('https://api.edutu.org/billing/checkout', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer clerk-session-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'd6ef9070-9172-4c4c-9c8b-1a0aef78c214',
      },
      body: JSON.stringify({ productKey: 'pro_monthly_pass', returnSurface: 'web' }),
    });
  });

  it('uses an authenticated portal-session endpoint and rejects a non-Bachs destination', async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://evil.example/portal/session-123' }),
    });

    await expect(requestBachsPortalSession({
      accessToken: 'clerk-session-token',
      config: enabledConfig,
      request,
    })).rejects.toThrow('approved Bachs portal URL');

    expect(request).toHaveBeenCalledWith('https://api.edutu.org/billing/portal-session', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer clerk-session-token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('keeps Bachs disabled unless its public launch flag is exactly true', async () => {
    const request = jest.fn();

    expect(isBachsCheckoutEnabled({})).toBe(false);
    await expect(requestBachsCheckout({
      accessToken: 'clerk-session-token',
      productKey: 'pro_monthly_pass',
      idempotencyKey: 'd6ef9070-9172-4c4c-9c8b-1a0aef78c214',
      config: { ...enabledConfig, enabled: false },
      request,
    })).rejects.toThrow('Payments are not ready');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('mobile billing rail selection', () => {
  it('keeps iOS and Android digital goods on RevenueCat while web uses Bachs', () => {
    expect(getPaymentRail('ios')).toBe('revenuecat');
    expect(getPaymentRail('android')).toBe('revenuecat');
    expect(getPaymentRail('web')).toBe('bachs');
  });

  it('hides the weekly native offer until RevenueCat returns the verified weekly product', () => {
    expect(visibleBillingPlans('ios', [
      { product: { identifier: 'pro_monthly' } },
      { product: { identifier: 'pro_yearly' } },
    ])).toEqual(['monthly', 'yearly']);

    expect(visibleBillingPlans('android', [
      { product: { identifier: 'pro_weekly' } },
      { product: { identifier: 'pro_monthly' } },
      { product: { identifier: 'pro_yearly' } },
    ])).toEqual(['monthly', 'weekly', 'yearly']);
  });

  it('maps web plans and credit purchases to fixed server product keys', () => {
    expect(webProductKeyForPlan('weekly')).toBe('pro_weekly_pass');
    expect(webProductKeyForPlan('monthly')).toBe('pro_monthly_pass');
    expect(webProductKeyForPlan('yearly')).toBe('pro_yearly_pass');
    expect(webProductKeyForCredit('credits_medium')).toBe('credits_medium');
    expect(() => webProductKeyForCredit('credits_admin_override')).toThrow('Unknown credit product');
  });
});
