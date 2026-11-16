import {
  assertLocalTestUrl,
  testApiBaseUrl,
} from '../test-utils/networkGuard';

describe('mobile Jest network isolation', () => {
  it('uses a localhost API sentinel instead of the production fallback', () => {
    expect(testApiBaseUrl(undefined)).toBe('http://127.0.0.1:9');
    expect(testApiBaseUrl('')).toBe('http://127.0.0.1:9');
    expect(testApiBaseUrl('https://example.test')).toBe('https://example.test');
  });

  it('rejects external HTTP origins', () => {
    expect(() => assertLocalTestUrl('https://edutu-platform.onrender.com/health')).toThrow(
      'Unexpected external network request in Jest',
    );
  });

  it('allows local test origins', () => {
    expect(() => assertLocalTestUrl('http://127.0.0.1:9/health')).not.toThrow();
    expect(() => assertLocalTestUrl('http://localhost:3000/health')).not.toThrow();
  });
});
