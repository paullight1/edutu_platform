import assert from 'node:assert/strict';
import test from 'node:test';
import * as auth from '../src/lib/auth';

test('rejects a raw user identifier as a pay-shell backend session', () => {
  const read = (auth as { readBackendSession?: (value?: string | null) => string | null }).readBackendSession;

  assert.equal(read?.('user_2aVeryRealLookingClerkSubject'), null);
});

test('accepts an opaque backend-issued session value without exposing identity', () => {
  const read = (auth as { readBackendSession?: (value?: string | null) => string | null }).readBackendSession;
  const opaqueSession = 'r4nd0mlyIssuedByTheBillingBackend_8ea4e611';

  assert.equal(read?.(opaqueSession), opaqueSession);
});

test('requires a matching Origin header for pay-shell mutation routes', () => {
  const original = process.env.PAY_SHELL_ORIGIN;
  process.env.PAY_SHELL_ORIGIN = 'https://pay.edutu.org';
  const sameOrigin = (auth as { isTrustedPayShellOrigin?: (origin: string | null) => boolean }).isTrustedPayShellOrigin;

  try {
    assert.equal(sameOrigin?.('https://pay.edutu.org'), true);
    assert.equal(sameOrigin?.('https://attacker.example'), false);
  } finally {
    if (original === undefined) delete process.env.PAY_SHELL_ORIGIN;
    else process.env.PAY_SHELL_ORIGIN = original;
  }
});

test('accepts only a hosted Bachs portal URL for browser navigation', () => {
  const parse = (auth as { bachsPortalUrl?: (value: unknown) => string | null }).bachsPortalUrl;

  assert.equal(parse?.('https://portal.bachs.io/sessions/opaque-session'), 'https://portal.bachs.io/sessions/opaque-session');
  assert.equal(parse?.('https://portal.bachs.io.attacker.example/sessions/opaque-session'), null);
  assert.equal(parse?.('javascript:alert(1)'), null);
});
