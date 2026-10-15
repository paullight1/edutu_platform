import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMobileAudit } from './check-mobile-audit.mjs';

function report(vulnerabilities) {
  return {
    metadata: { vulnerabilities: {} },
    vulnerabilities,
  };
}

test('passes when there are no high or critical vulnerabilities', () => {
  const result = evaluateMobileAudit(report({}));
  assert.equal(result.ok, true);
  assert.deepEqual(result.blocking, []);
});

test('fails on high Expo Metro image-size vulnerabilities', () => {
  const result = evaluateMobileAudit(
    report({
      'image-size': {
        severity: 'high',
        via: [{ name: 'image-size', severity: 'high', url: 'https://example.test/image-size' }],
      },
      metro: { severity: 'high', via: ['metro-file-map'] },
      '@expo/metro': { severity: 'high', via: ['metro'] },
      expo: { severity: 'high', via: ['@expo/metro'] },
      uuid: { severity: 'moderate' },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking, ['image-size (https://example.test/image-size)']);
});

test('fails on an unrelated high vulnerability', () => {
  const result = evaluateMobileAudit(
    report({
      'image-size': {
        severity: 'high',
        via: [{ name: 'image-size', severity: 'high', url: 'https://example.test/image-size' }],
      },
      lodash: {
        severity: 'high',
        via: [{ name: 'lodash', severity: 'high', url: 'https://example.test/lodash' }],
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking, [
    'image-size (https://example.test/image-size)',
    'lodash (https://example.test/lodash)',
  ]);
});

test('fails on critical and high vulnerabilities', () => {
  const result = evaluateMobileAudit(
    report({
      'image-size': {
        severity: 'critical',
        via: [{ name: 'image-size', severity: 'critical', url: 'https://example.test/image-size' }],
      },
      metro: {
        severity: 'high',
        via: [{ name: 'metro', severity: 'high', url: 'https://example.test/metro' }],
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking, [
    'image-size (https://example.test/image-size)',
    'metro (https://example.test/metro)',
  ]);
});

test('ignores aggregate package severities and reports actual advisories', () => {
  const result = evaluateMobileAudit(
    report({
      expo: { severity: 'high', via: ['@expo/cli'] },
      '@expo/cli': { severity: 'high', via: ['node-forge'] },
      'node-forge': {
        severity: 'high',
        via: [{ name: 'node-forge', severity: 'high', url: 'https://example.test/node-forge' }],
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking, ['node-forge (https://example.test/node-forge)']);
});

test('accepts an exact unexpired advisory exception but rejects an expired one', () => {
  const reportWithAdvisory = report({
    braces: {
      severity: 'high',
      via: [{ name: 'braces', severity: 'high', url: 'https://example.test/braces' }],
    },
  });
  const exception = {
    package: 'braces',
    url: 'https://example.test/braces',
    expiresOn: '2026-12-15',
    scope: 'Build tooling only.',
    reason: 'No patched release is available yet.',
  };

  const accepted = evaluateMobileAudit(
    reportWithAdvisory,
    [exception],
    new Date('2026-10-15T00:00:00Z'),
  );
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.accepted, ['braces (https://example.test/braces)']);

  const expired = evaluateMobileAudit(
    reportWithAdvisory,
    [exception],
    new Date('2026-12-15T00:00:00Z'),
  );
  assert.equal(expired.ok, false);
  assert.deepEqual(expired.blocking, ['braces (https://example.test/braces)']);
});
