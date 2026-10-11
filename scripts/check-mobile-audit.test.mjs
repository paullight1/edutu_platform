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
      'image-size': { severity: 'high' },
      metro: { severity: 'high' },
      '@expo/metro': { severity: 'high' },
      expo: { severity: 'high' },
      uuid: { severity: 'moderate' },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking.sort(), ['@expo/metro', 'expo', 'image-size', 'metro']);
});

test('fails on an unrelated high vulnerability', () => {
  const result = evaluateMobileAudit(
    report({
      'image-size': { severity: 'high' },
      lodash: { severity: 'high' },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking.sort(), ['image-size', 'lodash']);
});

test('fails on critical and high vulnerabilities', () => {
  const result = evaluateMobileAudit(
    report({
      'image-size': { severity: 'critical' },
      metro: { severity: 'high' },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking, ['image-size', 'metro']);
});
