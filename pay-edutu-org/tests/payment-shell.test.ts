import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET as deprecatedCheckout } from '../src/app/checkout/route';
import { config } from '../src/lib/env';

test('keeps Bachs collection disabled when the flag is absent', () => {
  const original = process.env.BACHS_CHECKOUT_ENABLED;
  delete process.env.BACHS_CHECKOUT_ENABLED;

  try {
    assert.equal((config as { bachsCheckoutEnabled?: () => boolean }).bachsCheckoutEnabled?.(), false);
  } finally {
    if (original === undefined) delete process.env.BACHS_CHECKOUT_ENABLED;
    else process.env.BACHS_CHECKOUT_ENABLED = original;
  }
});

test('requires an explicit canonical billing API origin', () => {
  const original = process.env.EDUTU_BILLING_API_URL;
  delete process.env.EDUTU_BILLING_API_URL;

  try {
    assert.throws(
      () => (config as { billingApiUrl?: () => string }).billingApiUrl?.(),
      /EDUTU_BILLING_API_URL/,
    );
  } finally {
    if (original === undefined) delete process.env.EDUTU_BILLING_API_URL;
    else process.env.EDUTU_BILLING_API_URL = original;
  }
});

test('deprecated checkout responds with a controlled payments-not-ready error', async () => {
  const response = await deprecatedCheckout(new NextRequest('https://pay.edutu.org/checkout?uid=user_12345&plan=monthly'));

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('location'), null);
  assert.deepEqual(await response.json(), { error: 'payments_not_ready' });
});
