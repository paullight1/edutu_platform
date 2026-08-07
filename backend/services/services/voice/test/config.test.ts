import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  NODE_ENV: 'test',
  COMMUNITY_CALL_TOKEN_SECRET: 'a-secure-secret-that-is-longer-than-32-bytes',
  VOICE_ANNOUNCED_ADDRESS: '127.0.0.1',
  VOICE_SIGNALING_URL: 'ws://127.0.0.1:4000/ws',
};

describe('loadConfig', () => {
  it('rejects a wildcard announced address', () => {
    expect(() => loadConfig({ ...base, VOICE_ANNOUNCED_ADDRESS: '0.0.0.0' })).toThrow(/wildcard/);
  });

  it('requires secure signaling in production', () => {
    expect(() => loadConfig({
      ...base,
      NODE_ENV: 'production',
      VOICE_ANNOUNCED_ADDRESS: '203.0.113.10',
    })).toThrow(/wss/);
  });

  it('rejects configuration with both media protocols disabled', () => {
    expect(() => loadConfig({ ...base, VOICE_ENABLE_TCP: 'false', VOICE_ENABLE_UDP: 'false' })).toThrow(/At least one/);
  });
});
