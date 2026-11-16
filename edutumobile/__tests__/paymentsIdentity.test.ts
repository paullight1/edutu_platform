describe('RevenueCat identity initialization', () => {
  const originalIosKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = 'test_mobile_key';
  });

  afterEach(() => {
    if (originalIosKey === undefined) {
      delete process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
    } else {
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = originalIosKey;
    }
  });

  it('configures once and logs in each raw authenticated subject change', async () => {
    const Purchases = require('react-native-purchases').default;
    const { initRevenueCat } = require('../packages/core/src/services/payments');

    await expect(initRevenueCat('user_clerk_first')).resolves.toBe(true);
    await expect(initRevenueCat('user_clerk_second')).resolves.toBe(true);

    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'test_mobile_key' });
    expect(Purchases.logIn).toHaveBeenCalledWith('user_clerk_first');
    expect(Purchases.logIn).toHaveBeenCalledWith('user_clerk_second');
  });
});

describe('server fulfillment polling', () => {
  it('retries until the server confirms fulfillment', async () => {
    const { waitForServerFulfillment } = require('../packages/core/src/services/payments');
    const check = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(waitForServerFulfillment(check, {
      attempts: 3,
      intervalMs: 1,
      sleep,
    })).resolves.toBe(true);

    expect(check).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('times out without treating a client purchase acknowledgement as fulfillment', async () => {
    const { waitForServerFulfillment } = require('../packages/core/src/services/payments');
    const check = jest.fn().mockResolvedValue(false);
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(waitForServerFulfillment(check, {
      attempts: 2,
      intervalMs: 1,
      sleep,
    })).resolves.toBe(false);

    expect(check).toHaveBeenCalledTimes(2);
  });
});
