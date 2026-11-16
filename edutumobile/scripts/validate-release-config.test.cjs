const { test } = require('node:test');
const assert = require('node:assert/strict');
const validate = require('./validate-release-config.cjs');

const production = {
  EAS_BUILD_PROFILE: 'production',
  EXPO_PUBLIC_API_URL: 'https://backend.edutu.org',
  EXPO_PUBLIC_SUPABASE_URL: 'https://supabase.edutu.org/',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
};

test('accepts existing production services and permits independent development settings', () => {
  assert.doesNotThrow(() => validate(production));
  assert.doesNotThrow(() => validate({ EAS_BUILD_PROFILE: 'development' }));
});
test('rejects retired services, missing configuration and development auth in store builds', () => {
  for (const override of [
    { EXPO_PUBLIC_API_URL: 'https://edutu-platform.onrender.com' },
    { EXPO_PUBLIC_SUPABASE_URL: 'https://sioxocmrjmdevsdlzjns.supabase.co' },
    { EXPO_PUBLIC_API_URL: undefined },
    { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture' },
  ]) assert.throws(() => validate({ ...production, ...override }));
  assert.throws(() => validate({ ...production, EAS_BUILD_PROFILE: 'production-apk', EXPO_PUBLIC_API_URL: 'http://localhost:3000' }));
});
