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
  assert.deepEqual(result.exceptions, []);
});

test('allows only the documented Expo Metro image-size high chain', () => {
  const result = evaluateMobileAudit(
    report({
      'image-size': { severity: 'high' },
      metro: { severity: 'high' },
      '@expo/metro': { severity: 'high' },
      expo: { severity: 'high' },
      uuid: { severity: 'moderate' },
    }),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.blocking, []);
  assert.deepEqual(result.exceptions.sort(), ['@expo/metro', 'expo', 'image-size', 'metro']);
});

test('fails on an unrelated high vulnerability', () => {
  const result = evaluateMobileAudit(
    report({
      'image-size': { severity: 'high' },
      lodash: { severity: 'high' },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking, ['lodash']);
});

test('fails on every critical vulnerability even when the package is allowlisted', () => {
  const result = evaluateMobileAudit(
    report({
      'image-size': { severity: 'critical' },
      metro: { severity: 'high' },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking, ['image-size', 'metro']);
});

test('does not activate the Expo exception without the image-size root advisory', () => {
  const result = evaluateMobileAudit(
    report({
      metro: { severity: 'high' },
      expo: { severity: 'high' },
    }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking.sort(), ['expo', 'metro']);
});
