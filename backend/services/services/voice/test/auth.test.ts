import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { ReplayGuard, verifyClientToken, verifyInternalToken } from '../src/auth/jwt.js';
import { testConfig, CALL_ID, GROUP_ID } from './helpers.js';

describe('JWT verification', () => {
  const config = testConfig();

  it('accepts the documented client join-token contract', async () => {
    const token = await new SignJWT({ callId: CALL_ID, groupId: GROUP_ID, role: 'member' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user_123')
      .setIssuer('edutu-api')
      .setAudience('edutu-voice')
      .setJti('join-token-123')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(config.jwtSecret);

    await expect(verifyClientToken(token, config.jwtSecret)).resolves.toMatchObject({
      sub: 'user_123', callId: CALL_ID, groupId: GROUP_ID, role: 'member', jti: 'join-token-123',
    });
  });

  it('rejects a replayed internal service token', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('edutu-api')
      .setIssuer('edutu-api')
      .setAudience('edutu-voice-internal')
      .setJti('service-token-123')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(config.jwtSecret);
    const guard = new ReplayGuard(120);

    await expect(verifyInternalToken(token, config.jwtSecret, guard)).resolves.toMatchObject({ subject: 'edutu-api' });
    await expect(verifyInternalToken(token, config.jwtSecret, guard)).rejects.toMatchObject({ code: 'AUTH_REPLAY' });
  });
});
